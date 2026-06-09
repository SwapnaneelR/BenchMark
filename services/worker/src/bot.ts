import type { ClientMessage, ServerMessage } from '@iicpc/protocol';

// TODO: single bot — send order, wait for response, record latency
export class Bot {
  constructor(private url: string, private orders: ClientMessage[]) {}

  async run(): Promise<{ latencies: number[]; orders: ClientMessage[]; fills: ServerMessage[] }> {
    throw new Error('Not implemented');
  }
}
