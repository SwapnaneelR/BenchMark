import type { ClientMessage, ServerMessage } from '@iicpc/protocol';

// TODO: open N concurrent WebSocket connections and ramp load
export class BotFleet {
  constructor(private url: string) {}

  async run(_concurrency = 10, _ordersPerBot = 100): Promise<{
    latencies: number[];
    orders: ClientMessage[];
    fills: ServerMessage[];
  }> {
    throw new Error('Not implemented');
  }
}
