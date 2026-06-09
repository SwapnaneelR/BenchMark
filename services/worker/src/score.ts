import type { Metrics } from './metrics';

// TODO: combine latency + correctness into composite score, ZADD to redis leaderboard
export async function saveScore(_teamId: string, _metrics: Metrics, _correctness: number): Promise<void> {
  throw new Error('Not implemented');
}
