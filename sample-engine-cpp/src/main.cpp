// High-performance C++ matching engine — WebSocket server on port 9000.
// Protocol: NewLimit / NewMarket / Cancel  →  Fill* + (Ack | Reject)
// Order book: price-time priority, mutex-protected (fast enough for microsecond ops).
// I/O model: Boost.Beast async WS, one strand per connection, thread-pool io_context.

#include <boost/asio.hpp>
#include <boost/beast/core.hpp>
#include <boost/beast/websocket.hpp>

#include <atomic>
#include <cstdio>
#include <deque>
#include <iostream>
#include <map>
#include <memory>
#include <mutex>
#include <string>
#include <thread>
#include <unordered_map>
#include <vector>

namespace asio  = boost::asio;
namespace beast = boost::beast;
namespace ws_ns = beast::websocket;
using tcp       = asio::ip::tcp;

// ── Order Book ────────────────────────────────────────────────────────────────

struct BookOrder { std::string id; int qty; int seq; };
struct OrderMeta { char side; int price; }; // side: 'b' | 's'

static std::mutex bookMtx;
static std::map<int, std::deque<BookOrder>, std::greater<int>> buys;  // price DESC
static std::map<int, std::deque<BookOrder>>                    sells; // price ASC
static std::unordered_map<std::string, OrderMeta>              orderMap;
static std::atomic<int> gSeq{0};

static std::string mkFill(const std::string& id, int qty, int price) {
    char b[256];
    snprintf(b, sizeof b,
             R"({"type":"Fill","id":"%s","qty":%d,"price":%d})",
             id.c_str(), qty, price);
    return b;
}
static std::string mkAck(const std::string& id) {
    char b[256];
    snprintf(b, sizeof b, R"({"type":"Ack","id":"%s"})", id.c_str());
    return b;
}
static std::string mkReject(const std::string& id, const char* reason) {
    char b[512];
    snprintf(b, sizeof b,
             R"({"type":"Reject","id":"%s","reason":"%s"})",
             id.c_str(), reason);
    return b;
}

// Match a new order against the opposite side. Returns fill messages for the taker.
// Fills sent only to taker — maker connections are not tracked globally.
static std::vector<std::string> processLimit(
        const std::string& id, char side, int price, int qty) {
    std::vector<std::string> out;
    std::lock_guard<std::mutex> lk(bookMtx);
    int rem = qty;

    if (side == 'b') {
        for (auto it = sells.begin(); it != sells.end() && rem > 0; ) {
            if (it->first > price) break;
            auto& q = it->second;
            while (!q.empty() && rem > 0) {
                auto& m   = q.front();
                int fill  = std::min(rem, m.qty);
                out.push_back(mkFill(id, fill, it->first));
                rem   -= fill;
                m.qty -= fill;
                if (m.qty == 0) { orderMap.erase(m.id); q.pop_front(); }
            }
            it = q.empty() ? sells.erase(it) : std::next(it);
        }
        if (rem > 0) {
            buys[price].push_back({id, rem, gSeq++});
            orderMap[id] = {'b', price};
        }
    } else {
        for (auto it = buys.begin(); it != buys.end() && rem > 0; ) {
            if (it->first < price) break;
            auto& q = it->second;
            while (!q.empty() && rem > 0) {
                auto& m   = q.front();
                int fill  = std::min(rem, m.qty);
                out.push_back(mkFill(id, fill, it->first));
                rem   -= fill;
                m.qty -= fill;
                if (m.qty == 0) { orderMap.erase(m.id); q.pop_front(); }
            }
            it = q.empty() ? buys.erase(it) : std::next(it);
        }
        if (rem > 0) {
            sells[price].push_back({id, rem, gSeq++});
            orderMap[id] = {'s', price};
        }
    }

    out.push_back(mkAck(id));
    return out;
}

static std::vector<std::string> processMarket(
        const std::string& id, char side, int qty) {
    std::vector<std::string> out;
    std::lock_guard<std::mutex> lk(bookMtx);
    int rem = qty;
    bool any = false;

    if (side == 'b') {
        for (auto it = sells.begin(); it != sells.end() && rem > 0; ) {
            auto& q = it->second;
            while (!q.empty() && rem > 0) {
                auto& m   = q.front();
                int fill  = std::min(rem, m.qty);
                out.push_back(mkFill(id, fill, it->first));
                rem   -= fill; m.qty -= fill; any = true;
                if (m.qty == 0) { orderMap.erase(m.id); q.pop_front(); }
            }
            it = q.empty() ? sells.erase(it) : std::next(it);
        }
    } else {
        for (auto it = buys.begin(); it != buys.end() && rem > 0; ) {
            auto& q = it->second;
            while (!q.empty() && rem > 0) {
                auto& m   = q.front();
                int fill  = std::min(rem, m.qty);
                out.push_back(mkFill(id, fill, it->first));
                rem   -= fill; m.qty -= fill; any = true;
                if (m.qty == 0) { orderMap.erase(m.id); q.pop_front(); }
            }
            it = q.empty() ? buys.erase(it) : std::next(it);
        }
    }

    out.push_back(any ? mkAck(id) : mkReject(id, "no liquidity"));
    return out;
}

static std::vector<std::string> processCancel(const std::string& id) {
    std::lock_guard<std::mutex> lk(bookMtx);
    auto it = orderMap.find(id);
    if (it == orderMap.end()) return { mkReject(id, "not found") };

    auto& meta = it->second;
    auto removeFrom = [&](auto& side_map) {
        auto lit = side_map.find(meta.price);
        if (lit == side_map.end()) return;
        auto& q = lit->second;
        for (auto qi = q.begin(); qi != q.end(); ++qi) {
            if (qi->id == id) { q.erase(qi); break; }
        }
        if (q.empty()) side_map.erase(lit);
    };

    if (meta.side == 'b') removeFrom(buys);
    else                   removeFrom(sells);
    orderMap.erase(it);
    return { mkAck(id) };
}

// ── JSON helpers ──────────────────────────────────────────────────────────────

static std::string jstr(const std::string& s, const char* key) {
    std::string needle = std::string(R"(")") + key + R"(":")";
    auto p = s.find(needle);
    if (p == std::string::npos) return {};
    p += needle.size();
    auto e = s.find('"', p);
    return e == std::string::npos ? std::string{} : s.substr(p, e - p);
}
static int jint(const std::string& s, const char* key) {
    std::string needle = std::string(R"(")") + key + R"(":)";
    auto p = s.find(needle);
    if (p == std::string::npos) return 0;
    return std::stoi(s.c_str() + p + needle.size());
}

// ── WebSocket Session ─────────────────────────────────────────────────────────

class Session : public std::enable_shared_from_this<Session> {
public:
    explicit Session(tcp::socket sock)
        : ws_(std::move(sock)) {}

    void start() {
        ws_.set_option(ws_ns::stream_base::timeout::suggested(beast::role_type::server));
        ws_.async_accept([self = shared_from_this()](beast::error_code ec) {
            if (!ec) self->doRead();
        });
    }

private:
    ws_ns::stream<beast::tcp_stream> ws_;
    beast::flat_buffer               buf_;
    std::deque<std::string>          wq_;
    bool                             writing_ = false;

    void doRead() {
        buf_.clear();
        ws_.async_read(buf_, [self = shared_from_this()](beast::error_code ec, size_t) {
            if (ec) return;
            for (auto& m : self->dispatch(beast::buffers_to_string(self->buf_.data())))
                self->enqueue(std::move(m));
            self->doRead();
        });
    }

    std::vector<std::string> dispatch(const std::string& txt) {
        auto type = jstr(txt, "type");
        auto id   = jstr(txt, "id");
        if (id.empty()) return {};

        if (type == "NewLimit") {
            auto sv = jstr(txt, "side");
            return processLimit(id, sv.empty() ? 'b' : sv[0],
                                jint(txt, "price"), jint(txt, "qty"));
        }
        if (type == "NewMarket") {
            auto sv = jstr(txt, "side");
            return processMarket(id, sv.empty() ? 'b' : sv[0], jint(txt, "qty"));
        }
        if (type == "Cancel") return processCancel(id);
        return {};
    }

    void enqueue(std::string msg) {
        wq_.push_back(std::move(msg));
        if (!writing_) flush();
    }

    void flush() {
        if (wq_.empty()) { writing_ = false; return; }
        writing_ = true;
        ws_.async_write(asio::buffer(wq_.front()),
            [self = shared_from_this()](beast::error_code, size_t) {
                self->wq_.pop_front();
                self->flush();
            });
    }
};

// ── Acceptor ──────────────────────────────────────────────────────────────────

class Listener : public std::enable_shared_from_this<Listener> {
public:
    Listener(asio::io_context& ioc, uint16_t port)
        : ioc_(ioc), acc_(asio::make_strand(ioc)) {
        tcp::endpoint ep{tcp::v4(), port};
        acc_.open(ep.protocol());
        acc_.set_option(asio::socket_base::reuse_address(true));
        acc_.bind(ep);
        acc_.listen(asio::socket_base::max_listen_connections);
    }
    void run() { accept(); }

private:
    asio::io_context& ioc_;
    tcp::acceptor     acc_;

    void accept() {
        acc_.async_accept(asio::make_strand(ioc_),
            [self = shared_from_this()](beast::error_code ec, tcp::socket sock) {
                if (!ec) std::make_shared<Session>(std::move(sock))->start();
                self->accept();
            });
    }
};

// ── main ──────────────────────────────────────────────────────────────────────

int main() {
    const uint16_t port    = 9000;
    const int      threads = std::max(2, (int)std::thread::hardware_concurrency());

    asio::io_context ioc(threads);
    std::make_shared<Listener>(ioc, port)->run();
    std::cerr << "[engine] ws://0.0.0.0:" << port
              << "  threads=" << threads << "\n";

    std::vector<std::thread> pool;
    pool.reserve(threads);
    for (int i = 0; i < threads; ++i)
        pool.emplace_back([&ioc] { ioc.run(); });
    for (auto& t : pool) t.join();
}
