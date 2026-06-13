#pragma once
#include <cstdint>
#include <string>
#include <vector>

struct Order {
    enum class Type { NewLimit, NewMarket, Cancel };
    Type        type;
    std::string id;
    std::string side;   // "buy" | "sell"
    int         price = 0;
    int         qty   = 0;
};

// Port of TypeScript mulberry32 + generateOrders — seeds and sequences match exactly.
std::vector<Order> generateOrders(int count, uint32_t seed);
