#include <boost/asio.hpp>
#include <boost/asio/co_spawn.hpp>
#include <boost/asio/redirect_error.hpp>
#include <boost/asio/use_awaitable.hpp>
#include <boost/beast/core.hpp>
#include <boost/beast/websocket.hpp>

#include <atomic>
#include <chrono>
#include <cstring>
#include <fstream>
#include <iostream>
#include <mutex>
#include <string>
#include <thread>
#include <unordered_map>
#include <vector>

#include "order_gen.h"

namespace asio  = boost::asio;
namespace beast = boost::beast;
namespace ws_ns = beast::websocket;
using tcp       = asio::ip::tcp;

// Global results — each bot appends to g_latencies_ms under g_mtx.
static std::mutex           g_mtx;
static std::vector<int64_t> g_latencies_ms;
static std::atomic<int64_t> g_acks{0};

static int64_t nowMs() {
    return std::chrono::duration_cast<std::chrono::milliseconds>(
               std::chrono::steady_clock::now().time_since_epoch())
        .count();
}

static std::string orderToJson(const Order& o) {
    char buf[320];
    switch (o.type) {
    case Order::Type::NewLimit:
        snprintf(buf, sizeof(buf),
                 R"({"type":"NewLimit","id":"%s","side":"%s","price":%d,"qty":%d})",
                 o.id.c_str(), o.side.c_str(), o.price, o.qty);
        break;
    case Order::Type::NewMarket:
        snprintf(buf, sizeof(buf),
                 R"({"type":"NewMarket","id":"%s","side":"%s","qty":%d})",
                 o.id.c_str(), o.side.c_str(), o.qty);
        break;
    case Order::Type::Cancel:
        snprintf(buf, sizeof(buf), R"({"type":"Cancel","id":"%s"})", o.id.c_str());
        break;
    }
    return buf;
}

// Extract the string value for a known key in a flat JSON object (no nesting/escaping).
static std::string jsonGet(const std::string& s, const char* key) {
    std::string needle = std::string("\"") + key + "\":\"";
    auto pos = s.find(needle);
    if (pos == std::string::npos) return {};
    pos += needle.size();
    auto end = s.find('"', pos);
    if (end == std::string::npos) return {};
    return s.substr(pos, end - pos);
}

asio::awaitable<void> runBot(
    std::string host,
    std::string port_str,
    int         botIdx,
    std::vector<Order> orders,
    int         staggerMs)
{
    auto ex = co_await asio::this_coro::executor;

    if (staggerMs > 0 && botIdx > 0) {
        asio::steady_timer timer(ex);
        timer.expires_after(std::chrono::milliseconds(static_cast<long>(botIdx) * staggerMs));
        co_await timer.async_wait(asio::use_awaitable);
    }

    try {
        tcp::resolver resolver(ex);
        auto eps = co_await resolver.async_resolve(host, port_str, asio::use_awaitable);

        ws_ns::stream<beast::tcp_stream> ws(ex);
        beast::get_lowest_layer(ws).expires_after(std::chrono::seconds(15));
        co_await beast::get_lowest_layer(ws).async_connect(*eps.begin(), asio::use_awaitable);

        ws.set_option(ws_ns::stream_base::timeout::suggested(beast::role_type::client));
        co_await ws.async_handshake(host, "/", asio::use_awaitable);

        std::unordered_map<std::string, int64_t> pending;
        pending.reserve(orders.size());

        // Send all orders (fire-and-forget into TCP send buffer).
        for (const auto& order : orders) {
            auto msg       = orderToJson(order);
            pending[order.id] = nowMs();
            co_await ws.async_write(asio::buffer(msg), asio::use_awaitable);
        }

        // Drain acks; give engine 5 seconds after last send.
        auto deadline = std::chrono::steady_clock::now() + std::chrono::seconds(5);
        beast::get_lowest_layer(ws).expires_at(deadline);

        std::vector<int64_t> local;
        local.reserve(orders.size());
        int received = 0;
        int expected = static_cast<int>(orders.size());

        while (received < expected) {
            beast::flat_buffer buf;
            boost::system::error_code ec;
            co_await ws.async_read(buf, asio::redirect_error(asio::use_awaitable, ec));
            if (ec) break;

            auto text = beast::buffers_to_string(buf.data());
            auto type = jsonGet(text, "type");
            if (type == "Ack" || type == "Reject") {
                ++received;
                auto id  = jsonGet(text, "id");
                auto it  = pending.find(id);
                if (it != pending.end()) {
                    local.push_back(nowMs() - it->second);
                    pending.erase(it);
                }
            }
            // Fill messages: engine sends Fill before Ack for matched orders; skip here.
        }

        boost::system::error_code ec2;
        co_await ws.async_close(ws_ns::close_code::normal,
                                asio::redirect_error(asio::use_awaitable, ec2));

        g_acks += received;
        {
            std::lock_guard<std::mutex> lk(g_mtx);
            g_latencies_ms.insert(g_latencies_ms.end(), local.begin(), local.end());
        }

    } catch (const std::exception& e) {
        std::cerr << "[fleet] bot-" << botIdx << " error: " << e.what() << "\n";
    }
}

int main(int argc, char* argv[]) {
    std::string url;
    int         botCount     = 50;
    int         ordersPerBot = 100;
    int         seedBase     = 1000;
    int         staggerMs    = 20;
    std::string resultsFile  = "/tmp/fleet-results.json";

    for (int i = 1; i < argc; ++i) {
        if      (!strcmp(argv[i], "--url"))     url          = argv[++i];
        else if (!strcmp(argv[i], "--bots"))    botCount     = std::stoi(argv[++i]);
        else if (!strcmp(argv[i], "--orders"))  ordersPerBot = std::stoi(argv[++i]);
        else if (!strcmp(argv[i], "--seed"))    seedBase     = std::stoi(argv[++i]);
        else if (!strcmp(argv[i], "--stagger")) staggerMs    = std::stoi(argv[++i]);
        else if (!strcmp(argv[i], "--out"))     resultsFile  = argv[++i];
    }

    if (url.empty()) {
        std::cerr << "Usage: fleet --url ws://host:port [--bots N] [--orders N] "
                     "[--seed N] [--stagger ms] [--out /path/results.json]\n";
        return 1;
    }

    // Parse ws://host:port[/path]
    std::string host, port_str;
    {
        auto s = url;
        if (s.rfind("ws://", 0) == 0) s = s.substr(5);
        auto colon = s.rfind(':');
        if (colon == std::string::npos) {
            host     = s;
            port_str = "9000";
        } else {
            host     = s.substr(0, colon);
            port_str = s.substr(colon + 1);
            auto sl  = port_str.find('/');
            if (sl != std::string::npos) port_str = port_str.substr(0, sl);
        }
    }

    int nThreads = std::max(2, static_cast<int>(std::thread::hardware_concurrency()));
    asio::io_context ioc(nThreads);

    g_latencies_ms.reserve(static_cast<size_t>(botCount) * ordersPerBot);

    auto t0 = std::chrono::steady_clock::now();

    for (int i = 0; i < botCount; ++i) {
        auto orders = generateOrders(ordersPerBot, static_cast<uint32_t>(seedBase + i));
        asio::co_spawn(ioc,
                       runBot(host, port_str, i, std::move(orders), staggerMs),
                       asio::detached);
    }

    std::vector<std::thread> threads;
    threads.reserve(nThreads);
    for (int i = 0; i < nThreads; ++i)
        threads.emplace_back([&ioc] { ioc.run(); });
    for (auto& t : threads) t.join();

    auto durationMs = std::chrono::duration_cast<std::chrono::milliseconds>(
                          std::chrono::steady_clock::now() - t0)
                          .count();

    int64_t totalAcks = g_acks.load();
    int64_t tps       = durationMs > 0 ? totalAcks * 1000 / durationMs : 0;

    std::cerr << "[fleet] " << botCount << " bots, " << totalAcks
              << " acks, " << durationMs << "ms, TPS=" << tps << "\n";

    std::ofstream out(resultsFile);
    out << "{\"acks\":" << totalAcks << ",\"tps\":" << tps << ",\"latencies_ms\":[";
    const auto& lats = g_latencies_ms;
    for (size_t j = 0; j < lats.size(); ++j) {
        if (j) out << ',';
        out << lats[j];
    }
    out << "]}\n";

    return 0;
}
