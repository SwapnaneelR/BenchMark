# PROTOCOL

## Submission Guidelines

Submit a **zip file** containing a `Dockerfile` at the root. The container must:
- Expose a **WebSocket server on port 9000**
- Be ready to accept connections within 10 seconds of startup
- Handle concurrent connections from multiple bots

Your image is built with `docker build`, then run with `--memory 512m --cpus 1`.

---

## Message Format

All messages are **JSON over WebSocket**, one message per frame.

### Client → Engine

**NewLimit** — place a limit order
```json
{ "type": "NewLimit", "id": "ord-1", "side": "buy", "price": 100, "qty": 5 }
```

**NewMarket** — place a market order (no price)
```json
{ "type": "NewMarket", "id": "ord-2", "side": "sell", "qty": 3 }
```

**Cancel** — cancel a resting order
```json
{ "type": "Cancel", "id": "ord-1" }
```

### Engine → Client

For every client message, the engine must respond with **at least one** message. The first response for an accepted order is an `Ack`. Subsequent `Fill` messages may follow.

**Ack** — order accepted / cancel processed
```json
{ "type": "Ack", "id": "ord-1" }
```

**Fill** — order (partially or fully) filled
```json
{ "type": "Fill", "id": "ord-1", "qty": 3, "price": 100 }
```
Multiple fills may be emitted for a single order if it matches against several resting orders.

**Reject** — order rejected (unknown id, no liquidity for market, etc.)
```json
{ "type": "Reject", "id": "ord-1", "reason": "No liquidity" }
```

---

## Matching Rules

- **Price-time priority**: best price first, FIFO within a price level.
- A `NewLimit` that crosses the spread must match before resting.
- A `NewMarket` that cannot fill (empty opposing side) must be `Reject`ed.
- Partial fills are allowed; the unfilled remainder of a limit order rests on the book.
- Cancelling a non-existent or already-filled id should return `Reject`.

---

## Scoring

| Component    | Weight | Metric                                       |
|--------------|--------|----------------------------------------------|
| Correctness  | 60%    | Fraction of fills matching reference engine  |
| Latency      | 40%    | p99 round-trip time (target < 10 ms)         |

Composite score (0–1000) is stored in Redis and shown on the leaderboard.
