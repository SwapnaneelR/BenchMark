import type { Redis } from 'ioredis';
import { Bot } from './bot';
import { generateOrders } from './orderGen';

export class BotFleet {
  constructor(
    private url: string,
    private runId: string,
    private redis?: Redis,
  ) {}

  async run(botCount = 50, ordersPerBot = 100): Promise<{ latencies: number[]; tps: number }> {
    const latencies: number[] = [];
    const startMs = Date.now();

    const workers = Array.from({ length: botCount }, (_, i) => {
      const bot = new Bot(this.url, `bot-${i}`, this.runId, this.redis);
      const orders = generateOrders(ordersPerBot, 1000 + i);
      // Stagger starts by 20ms per bot to avoid thundering herd
      return new Promise<void>(resolve =>
        setTimeout(async () => {
          await bot.runLoad(orders, (ms) => latencies.push(ms));
          resolve();
        }, i * 20)
      );
    });

    await Promise.all(workers);
    const durationMs = Date.now() - startMs;
    const tps = Math.round((latencies.length / durationMs) * 1000);
    return { latencies, tps };
  }
}
