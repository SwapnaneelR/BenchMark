export interface Metrics {
  p50: number;
  p90: number;
  p99: number;
  tps: number;
  stability: number;  // fraction 0-1: acks received / orders sent during load test
}

export function computeMetrics(latencies: number[], durationMs = 30000): Metrics {
  if (latencies.length === 0) return { p50: 0, p90: 0, p99: 0, tps: 0, stability: 0 };
  const sorted = [...latencies].sort((a, b) => a - b);
  const pct = (p: number) => sorted[Math.min(Math.floor((p / 100) * sorted.length), sorted.length - 1)];
  return {
    p50: pct(50),
    p90: pct(90),
    p99: pct(99),
    tps: Math.round((latencies.length / durationMs) * 1000),
    stability: 0,  // overwritten by runner after fleet result is available
  };
}
