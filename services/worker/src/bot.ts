import WebSocket from 'ws';
import type { ClientMessage, ServerMessage, Fill } from '@iicpc/protocol';
import type { RunResult } from './referenceEngine';
import type { Redis } from 'ioredis';

function logEvent(redis: Redis | undefined, data: object) {
  if (!redis) return;
  redis.xadd('events', '*', 'data', JSON.stringify(data)).catch(() => {});
}

export class Bot {
  constructor(
    private url: string,
    private botId = 'bot-0',
    private runId = '',
    private teamId = '',
    private redis?: Redis,
  ) {}

  async runSerial(orders: ClientMessage[]): Promise<{ results: RunResult[]; latencies: number[] }> {
    const ws = new WebSocket(this.url);
    await new Promise<void>((res, rej) => { ws.once('open', res); ws.once('error', rej); });

    const results: RunResult[] = [];
    const latencies: number[] = [];

    for (const order of orders) {
      const startMs = Date.now();
      const fills: { price: number; qty: number }[] = [];

      const result = await new Promise<RunResult>((resolve) => {
        let settled = false;
        const guard = setTimeout(() => {
          if (settled) return;
          settled = true;
          ws.off('message', handler);
          resolve({ requestId: order.id, fills, rejected: true });
        }, 3000);

        const handler = (raw: WebSocket.RawData) => {
          const msg = JSON.parse(raw.toString()) as ServerMessage;
          if (msg.id !== order.id) return;

          if (msg.type === 'Fill') {
            const f = msg as Fill;
            fills.push({ price: f.price, qty: f.qty });
          } else if (msg.type === 'Ack') {
            setTimeout(() => {
              if (settled) return;
              settled = true;
              clearTimeout(guard);
              ws.off('message', handler);
              resolve({ requestId: order.id, fills, rejected: false });
            }, 15);
          } else if (msg.type === 'Reject') {
            if (settled) return;
            settled = true;
            clearTimeout(guard);
            ws.off('message', handler);
            resolve({ requestId: order.id, fills: [], rejected: true });
          }
        };

        ws.on('message', handler);
        ws.send(JSON.stringify(order));

        logEvent(this.redis, {
          ts: Date.now(), runId: this.runId, teamId: this.teamId, botId: this.botId,
          level: 'info', event: 'order_sent',
          orderId: order.id, type: order.type,
        });
      });

      latencies.push(Date.now() - startMs);
      results.push(result);

      logEvent(this.redis, {
        ts: Date.now(), runId: this.runId, teamId: this.teamId, botId: this.botId,
        level: 'info', event: result.rejected ? 'rejected' : 'acked',
        orderId: order.id, latencyMs: latencies[latencies.length - 1],
      });
    }

    ws.close();
    return { results, latencies };
  }

  async runLoad(orders: ClientMessage[], onAck: (latencyMs: number) => void): Promise<void> {
    const ws = new WebSocket(this.url);
    await new Promise<void>((res, rej) => { ws.once('open', res); ws.once('error', rej); });

    const pending = new Map<string, number>();

    ws.on('message', (raw) => {
      const msg = JSON.parse(raw.toString()) as ServerMessage;
      if (msg.type === 'Ack' || msg.type === 'Reject') {
        const sent = pending.get(msg.id);
        if (sent !== undefined) {
          pending.delete(msg.id);
          onAck(Date.now() - sent);
          logEvent(this.redis, {
            ts: Date.now(), runId: this.runId, teamId: this.teamId, botId: this.botId,
            level: 'info', event: 'ack', orderId: msg.id,
            latencyMs: Date.now() - sent,
          });
        }
      }
    });

    for (const order of orders) {
      pending.set(order.id, Date.now());
      ws.send(JSON.stringify(order));
      logEvent(this.redis, {
        ts: Date.now(), runId: this.runId, teamId: this.teamId, botId: this.botId,
        level: 'info', event: 'order_sent', orderId: order.id, type: order.type,
      });
      // Small yield to avoid socket buffer overflow
      await new Promise(r => setImmediate(r));
    }

    // Drain remaining acks
    await new Promise<void>(r => setTimeout(r, 3000));
    ws.close();
  }
}
