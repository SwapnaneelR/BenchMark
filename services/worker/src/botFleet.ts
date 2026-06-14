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

  async run(botCount = 50, ordersPerBot = 100): Promise<{ latencies: number[]; tps: number; stability: number; tradeStats: TradeStats }> {
    const resultsFile = path.join(tmpdir(), `fleet-${this.runId}.json`);
    // Spread connections over ~10 seconds to avoid thundering herd on the engine's accept().
    const staggerMs = Math.max(5, Math.floor(10_000 / botCount));

    try {
      const { stderr } = await execFileAsync(
        'fleet',
        [
          '--url',     this.url,
          '--bots',    String(botCount),
          '--orders',  String(ordersPerBot),
          '--seed',    '1000',
          '--stagger', String(staggerMs),
          '--out',     resultsFile,
        ],
        { timeout: 300_000 },
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

    const expected = botCount * ordersPerBot;
    const stability = expected > 0 ? Math.min(1, result.acks / expected) : 0;

    const tradeStats: TradeStats = {
      totalOrders:    expected,
      ackedOrders:    result.acks - (result.rejectCount ?? 0),
      rejectedOrders: result.rejectCount ?? 0,
      fillCount:      result.fillCount ?? 0,
      filledOrders:   result.filledOrders ?? 0,
      filledQty:      result.filledQty ?? 0,
      volumeUsd:      result.volumeUsd ?? 0,
      realizedPnl:    result.realizedPnl ?? 0,
      netPosition:    result.netPosition ?? 0,
    };

    console.log(`[fleet] ${result.acks}/${expected} acks, TPS=${result.tps}, stability=${(stability * 100).toFixed(1)}%, filledOrders=${tradeStats.filledOrders}, volumeUsd=${tradeStats.volumeUsd}`);
    return { latencies: result.latencies_ms, tps: result.tps, stability, tradeStats };
  }
}
