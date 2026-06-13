#include "order_gen.h"
#include <algorithm>
#include <cmath>
#include <string>
#include <vector>

// Faithful port of TypeScript mulberry32 — all operations on uint32_t produce identical
// bit patterns to JS bitwise ops (two's complement, same wrapping behaviour).
static uint32_t g_state;

static void seedRng(uint32_t s) { g_state = s; }

static double nextRng() {
    g_state += 0x6D2B79F5u;
    uint32_t z = g_state;
    z = (z ^ (z >> 15u)) * (1u | z);
    z = (z + ((z ^ (z >> 7u)) * (61u | z))) ^ z;
    z = z ^ (z >> 14u);
    return static_cast<double>(z) / 4294967296.0;
}

std::vector<Order> generateOrders(int count, uint32_t seed) {
    seedRng(seed);

    std::vector<Order> orders;
    orders.reserve(count);
    std::vector<std::string> resting;

    double mid = 100.0;
    int    seq = 0;

    for (int i = 0; i < count; ++i) {
        double r  = nextRng();
        mid      += (nextRng() - 0.5) * 2.0;
        mid       = std::max(50.0, std::min(150.0, mid));
        double midRound = std::round(mid * 100.0) / 100.0;

        if (r < 0.10 && !resting.empty()) {
            int idx = static_cast<int>(nextRng() * static_cast<double>(resting.size()));
            std::string cancelId = resting[idx];
            resting.erase(resting.begin() + idx);
            Order o;
            o.type = Order::Type::Cancel;
            o.id   = cancelId;
            orders.push_back(std::move(o));

        } else if (r < 0.25) {
            Order o;
            o.type = Order::Type::NewMarket;
            o.id   = "m-" + std::to_string(seed) + "-" + std::to_string(seq++);
            o.side = nextRng() < 0.5 ? "buy" : "sell";
            o.qty  = static_cast<int>(nextRng() * 5.0) + 1;
            orders.push_back(std::move(o));

        } else {
            Order o;
            o.type  = Order::Type::NewLimit;
            o.id    = "l-" + std::to_string(seed) + "-" + std::to_string(seq++);
            o.side  = nextRng() < 0.5 ? "buy" : "sell";
            int spread = static_cast<int>(nextRng() * 5.0) + 1;
            int mri    = static_cast<int>(std::round(midRound));
            o.price    = o.side == "buy" ? std::max(1, mri - spread) : mri + spread;
            o.qty      = static_cast<int>(nextRng() * 9.0) + 1;
            resting.push_back(o.id);
            orders.push_back(std::move(o));
        }
    }

    return orders;
}
