import { execFile } from 'child_process';
import { promisify } from 'util';
import { readFile, unlink } from 'fs/promises';
import { tmpdir } from 'os';
import path from 'path';
import type { TradeStats } from './trading';

const execFileAsync = promisify(execFile);

export class BotFleet {
  constructor(
    private url: string,
    private runId: string,
    private redis?: unknown,
  ) {}

  async run(botCount = 50, ordersPerBot = 100): Promise<{ latencies: number[]; tps: number; tradeStats: TradeStats }> {
    const resultsFile = path.join(tmpdir(), `fleet-${this.runId}.json`);

    try {
      const { stderr } = await execFileAsync(
        'fleet',
        [
          '--url',     this.url,
          '--bots',    String(botCount),
          '--orders',  String(ordersPerBot),
          '--seed',    '1000',
          '--stagger', '20',
          '--out',     resultsFile,
        ],
        { timeout: 180_000 },
      );
      if (stderr) console.log('[fleet]', stderr.trim());
    } catch (err: any) {
      console.error('[fleet] binary failed:', err.stderr ?? err.message);
      throw err;
    }

    const raw = await readFile(resultsFile, 'utf8');
    await unlink(resultsFile).catch(() => {});

    const result = JSON.parse(raw) as {
      acks: number;
      tps: number;
      latencies_ms: number[];
      rejectCount?: number;
      fillCount?: number;
      filledOrders?: number;
      filledQty?: number;
      volumeUsd?: number;
      realizedPnl?: number;
      netPosition?: number;
    };
    const tradeStats: TradeStats = {
      totalOrders: botCount * ordersPerBot,
      ackedOrders: result.acks - (result.rejectCount ?? 0),
      rejectedOrders: result.rejectCount ?? 0,
      fillCount: result.fillCount ?? 0,
      filledOrders: result.filledOrders ?? 0,
      filledQty: result.filledQty ?? 0,
      volumeUsd: result.volumeUsd ?? 0,
      realizedPnl: result.realizedPnl ?? 0,
      netPosition: result.netPosition ?? 0,
    };
    console.log(`[fleet] ${result.acks} acks, TPS=${result.tps}, filledOrders=${tradeStats.filledOrders}, volumeUsd=${tradeStats.volumeUsd}`);
    return { latencies: result.latencies_ms, tps: result.tps, tradeStats };
  }
}
