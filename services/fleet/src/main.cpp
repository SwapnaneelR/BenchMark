#include <boost/asio.hpp>
#include <boost/asio/co_spawn.hpp>
#include <boost/asio/redirect_error.hpp>
#include <boost/asio/use_awaitable.hpp>
#include <boost/beast/core.hpp>
#include <boost/beast/websocket.hpp>

#include <atomic>
#include <chrono>
#include <cmath>
#include <cstring>
#include <fstream>
#include <iostream>
#include <mutex>
#include <string>
#include <thread>
#include <unordered_map>
#include <unordered_set>
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

struct BotStats {
    int64_t acks = 0;
    int64_t rejects = 0;
    int64_t fillCount = 0;
    int64_t filledOrders = 0;
    int64_t filledQty = 0;
    int64_t volumeUsd = 0;
    int64_t netPosition = 0;
    double costBasis = 0;
    double realizedPnl = 0;
};

static BotStats g_aggStats;

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

static int jsonGetInt(const std::string& s, const char* key, int defaultValue = 0) {
    std::string needle = std::string("\"") + key + "\":";
    auto pos = s.find(needle);
    if (pos == std::string::npos) return defaultValue;
    pos += needle.size();
    while (pos < s.size() && std::isspace(static_cast<unsigned char>(s[pos]))) pos++;
    int sign = 1;
    if (pos < s.size() && (s[pos] == '+' || s[pos] == '-')) {
        if (s[pos] == '-') sign = -1;
        pos++;
    }
    auto end = pos;
    while (end < s.size() && std::isdigit(static_cast<unsigned char>(s[end]))) end++;
    if (end == pos) return defaultValue;
    return std::stoi(s.substr(pos, end - pos)) * sign;
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
        std::unordered_map<std::string, std::string> sideById;
        sideById.reserve(orders.size());
        BotStats stats;
        std::unordered_set<std::string> seenFilledOrders;

        // Send all orders (fire-and-forget into TCP send buffer).
        for (const auto& order : orders) {
            auto msg = orderToJson(order);
            pending[order.id] = nowMs();
            if (order.type != Order::Type::Cancel) {
                sideById[order.id] = order.side;
            }
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
                if (type == "Reject") {
                    ++stats.rejects;
                }
                auto id  = jsonGet(text, "id");
                auto it  = pending.find(id);
                if (it != pending.end()) {
                    local.push_back(nowMs() - it->second);
                    pending.erase(it);
                }
                ++stats.acks;
            } else if (type == "Fill") {
                auto id = jsonGet(text, "id");
                auto qty = jsonGetInt(text, "qty");
                auto price = jsonGetInt(text, "price");
                if (qty > 0 && price > 0) {
                    ++stats.fillCount;
                    stats.filledQty += qty;
                    stats.volumeUsd += static_cast<int64_t>(price) * qty;
                    if (seenFilledOrders.insert(id).second) {
                        ++stats.filledOrders;
                    }
                    const auto it = sideById.find(id);
                    const auto side = it != sideById.end() ? it->second : "Buy";
                    const int sideSign = side == "Sell" ? -1 : 1;
                    const int64_t prevPosition = stats.netPosition;
                    if (prevPosition == 0 || (prevPosition > 0) == (sideSign > 0)) {
                        stats.netPosition += sideSign * qty;
                        stats.costBasis += sideSign * static_cast<double>(price) * qty;
                    } else {
                        const int64_t closeQty = std::min<int64_t>(static_cast<int64_t>(std::llabs(prevPosition)), static_cast<int64_t>(qty));
                        const double avgCost = std::abs(stats.costBasis) / std::max<int64_t>(1, static_cast<int64_t>(std::llabs(prevPosition)));
                        if (prevPosition > 0) {
                            stats.realizedPnl += closeQty * (price - avgCost);
                        } else {
                            stats.realizedPnl += closeQty * (avgCost - price);
                        }
                        stats.netPosition += sideSign * closeQty;
                        stats.costBasis -= std::copysign(avgCost * closeQty, static_cast<double>(prevPosition));
                        if (qty > closeQty) {
                            const int64_t remainder = qty - closeQty;
                            stats.netPosition += sideSign * remainder;
                            stats.costBasis += sideSign * static_cast<double>(price) * remainder;
                        }
                        if (stats.netPosition == 0) {
                            stats.costBasis = 0;
                        }
                    }
                }
            }
        }

        boost::system::error_code ec2;
        co_await ws.async_close(ws_ns::close_code::normal,
                                asio::redirect_error(asio::use_awaitable, ec2));

        g_acks += received;
        {
            std::lock_guard<std::mutex> lk(g_mtx);
            g_latencies_ms.insert(g_latencies_ms.end(), local.begin(), local.end());
            g_aggStats.acks += stats.acks;
            g_aggStats.rejects += stats.rejects;
            g_aggStats.fillCount += stats.fillCount;
            g_aggStats.filledOrders += stats.filledOrders;
            g_aggStats.filledQty += stats.filledQty;
            g_aggStats.volumeUsd += stats.volumeUsd;
            g_aggStats.netPosition += stats.netPosition;
            g_aggStats.realizedPnl += stats.realizedPnl;
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
              << " acks, " << durationMs << "ms, TPS=" << tps
              << ", filledOrders=" << g_aggStats.filledOrders
              << ", volumeUsd=" << g_aggStats.volumeUsd
              << ", pnl=" << g_aggStats.realizedPnl << "\n";

    std::ofstream out(resultsFile);
    out << "{\"acks\":" << totalAcks
        << ",\"tps\":" << tps
        << ",\"latencies_ms\": [";
    const auto& lats = g_latencies_ms;
    for (size_t j = 0; j < lats.size(); ++j) {
        if (j) out << ',';
        out << lats[j];
    }
    out << "],\"rejectCount\":" << g_aggStats.rejects
        << ",\"fillCount\":" << g_aggStats.fillCount
        << ",\"filledOrders\":" << g_aggStats.filledOrders
        << ",\"filledQty\":" << g_aggStats.filledQty
        << ",\"volumeUsd\":" << g_aggStats.volumeUsd
        << ",\"realizedPnl\":" << g_aggStats.realizedPnl
        << ",\"netPosition\":" << g_aggStats.netPosition
        << "}\n";

    return 0;
}
