import { redis } from './redis';
import type { Metrics } from './metrics';
import type { TradeStats } from './trading';

// Weights: 40% correctness, 20% latency, 40% trade performance
const TARGET_P99_MS = 10;
const TARGET_PNL_USD = 10000;
const TARGET_VOLUME_USD = 50000;
const TRADE_PNL_WEIGHT = 0.55;
const TRADE_FILL_RATE_WEIGHT = 0.30;
const TRADE_VOLUME_WEIGHT = 0.15;

function clamp01(value: number) {
  return Math.max(0, Math.min(1, value));
}

function normalizePnl(realizedPnl: number) {
  return clamp01(realizedPnl / TARGET_PNL_USD);
}

function normalizeVolume(volumeUsd: number) {
  return clamp01(Math.log10(volumeUsd + 1) / Math.log10(TARGET_VOLUME_USD + 1));
}

function computeTradeScore(tradeStats: TradeStats | undefined) {
  if (!tradeStats) return 0;
  const pnlScore = normalizePnl(tradeStats.realizedPnl);
  const fillRate = tradeStats.totalOrders > 0
    ? clamp01(tradeStats.fillCount / tradeStats.totalOrders)
    : 0;
  const volumeScore = normalizeVolume(tradeStats.volumeUsd);
  return clamp01(
    pnlScore * TRADE_PNL_WEIGHT +
    fillRate * TRADE_FILL_RATE_WEIGHT +
    volumeScore * TRADE_VOLUME_WEIGHT
  );
}

export async function saveScore(
  teamId: string,
  runId: string,
  metrics: Metrics,
  correctness: number,
  tradeStats?: TradeStats,
): Promise<number> {
  const latencyScore = Math.max(0, 1 - metrics.p99 / (TARGET_P99_MS * 10));
  const tradeScore = computeTradeScore(tradeStats);
  const score = Math.round((correctness * 0.4 + latencyScore * 0.2 + tradeScore * 0.4) * 1000);

  await redis.zadd('leaderboard', score, teamId);

  const details = {
    runId,
    teamId,
    metrics,
    correctness: Math.round(correctness * 1000) / 1000,
    score,
    timestamp: Date.now(),
    tradeStats,
  };
  await redis.set(`run:${runId}`, JSON.stringify(details), 'EX', 86400);
  await redis.set(`team:${teamId}:lastRun`, runId, 'EX', 86400);

  return score;
}
