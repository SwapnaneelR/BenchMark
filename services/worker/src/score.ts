import { redis } from './redis';
import type { Metrics } from './metrics';
import type { TradeStats } from './trading';

// Weights: 50% correctness, 30% latency (p99 <100ms), 20% stability (ack success rate)
// tradeStats are recorded for display/analytics but do NOT affect the score —
// PnL from bots trading against the engine reflects price-movement luck, not engine quality.

export async function saveScore(
  teamId: string,
  runId: string,
  metrics: Metrics,
  correctness: number,
  tradeStats?: TradeStats,
): Promise<number> {
  const latencyScore   = Math.max(0, 1 - metrics.p99 / 100);
  const stabilityScore = metrics.stability ?? 1;
  const score = Math.round((correctness * 0.5 + latencyScore * 0.3 + stabilityScore * 0.2) * 1000);

  await redis.zadd('leaderboard', score, teamId);

  const details = {
    runId,
    teamId,
    metrics,
    correctness: Math.round(correctness * 1000) / 1000,
    stability:   Math.round(stabilityScore * 1000) / 1000,
    score,
    timestamp: Date.now(),
    tradeStats,
  };
  await redis.set(`run:${runId}`, JSON.stringify(details), 'EX', 86400);
  await redis.set(`team:${teamId}:lastRun`, runId, 'EX', 86400);

  return score;
}
