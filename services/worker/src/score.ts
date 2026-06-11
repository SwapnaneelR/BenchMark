import { redis } from './redis';
import type { Metrics } from './metrics';

// Weights: 60% correctness, 40% latency (p99 target <10ms)
const TARGET_P99_MS = 10;

export async function saveScore(
  teamId: string,
  runId: string,
  metrics: Metrics,
  correctness: number,
): Promise<number> {
  const latencyScore = Math.max(0, 1 - metrics.p99 / (TARGET_P99_MS * 10));
  const score = Math.round((correctness * 0.6 + latencyScore * 0.4) * 1000);

  await redis.zadd('leaderboard', score, teamId);

  const details = {
    runId,
    teamId,
    metrics,
    correctness: Math.round(correctness * 1000) / 1000,
    score,
    timestamp: Date.now(),
  };
  await redis.set(`run:${runId}`, JSON.stringify(details), 'EX', 86400);
  await redis.set(`team:${teamId}:lastRun`, runId, 'EX', 86400);

  return score;
}
