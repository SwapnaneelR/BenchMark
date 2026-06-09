export interface Metrics {
  p50: number;
  p90: number;
  p99: number;
  tps: number;
}

// TODO: compute percentile latencies and TPS from raw latency array
export function computeMetrics(_latencies: number[], _durationMs?: number): Metrics {
  throw new Error('Not implemented');
}
