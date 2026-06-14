import path from 'path';
import {
  extractZip, buildImage,
  runContainer, removeContainer, waitForWs,
} from './docker';
import { generateOrders } from './orderGen';
import { Bot } from './bot';
import { BotFleet } from './botFleet';
import { ReferenceEngine } from './referenceEngine';
import { computeMetrics } from './metrics';
import { saveScore } from './score';
import { redis } from './redis';
import type { TradeStats } from './trading';

export async function run(data: { teamId: string; zipPath: string; botCount?: number }) {
  const runId = `${data.teamId}-${Date.now()}`;
  console.log(`[runner] Starting run ${runId}`);

  redis.xadd('events', '*', 'data', JSON.stringify({
    ts: Date.now(), runId, level: 'info', event: 'run_started', teamId: data.teamId,
  })).catch(() => {});

  const submissionDir = path.join(path.dirname(data.zipPath), 'extracted');
  await extractZip(data.zipPath, submissionDir);
  console.log(`[runner] Extracted to ${submissionDir}`);

  const tag = `submission-${runId.toLowerCase().replace(/[^a-z0-9-]/g, '-')}`;
  await buildImage(submissionDir, tag);
  console.log(`[runner] Built image ${tag}`);

  const containerName = `engine-${runId.toLowerCase().replace(/[^a-z0-9-]/g, '-')}`;
  const { id: containerId, hostPort } = await runContainer(tag, containerName);
  const wsUrl = `ws://docker-daemon:${hostPort}`;
  console.log(`[runner] Container ${containerId} published port ${hostPort}, url=${wsUrl}`);

  redis.xadd('events', '*', 'data', JSON.stringify({
    ts: Date.now(), runId, teamId: data.teamId, level: 'info', event: 'container_started', containerId, wsUrl,
  })).catch(() => {});

  try {
    await waitForWs(wsUrl);
    console.log(`[runner] Engine ready at ${wsUrl}`);

    // Phase 1: serial correctness run
    const correctnessOrders = generateOrders(200, 42);
    const serialBot = new Bot(wsUrl, 'serial', runId, data.teamId, redis);
    const { results: actualResults, latencies: serialLatencies, tradeStats: serialTradeStats } = await serialBot.runSerial(correctnessOrders);

    const ref = new ReferenceEngine();
    const correctness = ref.validate(correctnessOrders, actualResults);
    console.log(`[runner] Correctness: ${(correctness * 100).toFixed(1)}%`);

    redis.xadd('events', '*', 'data', JSON.stringify({
      ts: Date.now(), runId, teamId: data.teamId, level: 'info', event: 'correctness_done',
      correctness: Math.round(correctness * 1000) / 1000,
      tradeStats: serialTradeStats,
    })).catch(() => {});

    // Phase 2: load test
    const fleet = new BotFleet(wsUrl, runId, redis);
    const { latencies: loadLatencies, tps, tradeStats: loadTradeStats } = await fleet.run(data.botCount ?? 50, 100);
    console.log(`[runner] Load test done: ${loadLatencies.length} acks, ${tps} TPS, volume=${loadTradeStats.volumeUsd}`);

    redis.xadd('events', '*', 'data', JSON.stringify({
      ts: Date.now(), runId, teamId: data.teamId, level: 'info', event: 'load_trading_done',
      tps, tradeStats: loadTradeStats,
    })).catch(() => {});

    const allLatencies = [...serialLatencies, ...loadLatencies];
    const metrics = computeMetrics(allLatencies, 30_000);
    metrics.tps = tps;

    const combinedTradeStats: TradeStats = {
      totalOrders: serialTradeStats.totalOrders + loadTradeStats.totalOrders,
      ackedOrders: serialTradeStats.ackedOrders + loadTradeStats.ackedOrders,
      rejectedOrders: serialTradeStats.rejectedOrders + loadTradeStats.rejectedOrders,
      fillCount: serialTradeStats.fillCount + loadTradeStats.fillCount,
      filledOrders: serialTradeStats.filledOrders + loadTradeStats.filledOrders,
      filledQty: serialTradeStats.filledQty + loadTradeStats.filledQty,
      volumeUsd: serialTradeStats.volumeUsd + loadTradeStats.volumeUsd,
      realizedPnl: serialTradeStats.realizedPnl + loadTradeStats.realizedPnl,
      netPosition: serialTradeStats.netPosition + loadTradeStats.netPosition,
    };

    const score = await saveScore(data.teamId, runId, metrics, correctness, combinedTradeStats);

    redis.xadd('events', '*', 'data', JSON.stringify({
      ts: Date.now(), runId, teamId: data.teamId, level: 'info', event: 'run_complete',
      score, correctness, metrics, tradeStats: combinedTradeStats,
    })).catch(() => {});

    console.log(`[runner] Run ${runId} complete: score=${score} p99=${metrics.p99}ms tps=${tps}`);
  } catch (err) {
    console.error(`[runner] Run ${runId} failed:`, err);
    redis.xadd('events', '*', 'data', JSON.stringify({
      ts: Date.now(), runId, teamId: data.teamId, level: 'error', event: 'run_failed',
      error: String(err),
    })).catch(() => {});
    throw err;
  } finally {
    await removeContainer(containerId);
    console.log(`[runner] Cleaned up container ${containerId}`);
  }
}
