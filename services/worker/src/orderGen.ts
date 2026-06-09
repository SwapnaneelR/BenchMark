import type { ClientMessage } from '@iicpc/protocol';

// TODO: seeded deterministic order generation (NewLimit / NewMarket / Cancel mix)
export function generateOrders(_count: number, _seed = 42): ClientMessage[] {
  throw new Error('Not implemented');
}
