import type { ClientMessage } from '@iicpc/protocol';

function mulberry32(seed: number): () => number {
  return () => {
    seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function generateOrders(count: number, seed = 42): ClientMessage[] {
  const rng = mulberry32(seed);
  const orders: ClientMessage[] = [];
  let mid = 100;
  const resting: string[] = [];
  let seq = 0;

  for (let i = 0; i < count; i++) {
    const r = rng();
    mid += (rng() - 0.5) * 2;
    mid = Math.max(50, Math.min(150, mid));
    const midRound = Math.round(mid * 100) / 100;

    if (r < 0.10 && resting.length > 0) {
      const idx = Math.floor(rng() * resting.length);
      const orderId = resting.splice(idx, 1)[0];
      orders.push({ type: 'Cancel', id: orderId });
    } else if (r < 0.25) {
      const id = `m-${seed}-${seq++}`;
      const side = rng() < 0.5 ? 'buy' : 'sell';
      const qty = Math.floor(rng() * 5) + 1;
      orders.push({ type: 'NewMarket', id, side, qty });
    } else {
      const id = `l-${seed}-${seq++}`;
      const side = rng() < 0.5 ? 'buy' : 'sell';
      const spread = Math.floor(rng() * 5) + 1;
      const price = side === 'buy'
        ? Math.max(1, Math.round(midRound - spread))
        : Math.round(midRound + spread);
      const qty = Math.floor(rng() * 9) + 1;
      orders.push({ type: 'NewLimit', id, side, price, qty });
      resting.push(id);
    }
  }

  return orders;
}
