import path from 'path';
import {
  extractZip, buildImage,
  createBenchNetwork, connectWorkerToNetwork, disconnectWorkerFromNetwork, removeBenchNetwork,
  runContainer, removeContainer, waitForWs,
} from './docker';
import { generateOrders } from './orderGen';
import { Bot } from './bot';
import { BotFleet } from './botFleet';
import { ReferenceEngine } from './referenceEngine';
import { computeMetrics } from './metrics';
import { saveScore } from './score';
import { redis } from './redis';

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

  // Each run gets its own --internal bridge network.
  // Engine container lives only on this network: no internet, no cross-run visibility.
  const network       = await createBenchNetwork(runId);
  const containerName = `engine-${runId.toLowerCase().replace(/[^a-z0-9-]/g, '-')}`;

  // Connect the worker container itself so the fleet subprocess can reach the engine.
  await connectWorkerToNetwork(network);

  const { id: containerId } = await runContainer(tag, network, containerName);
  // Docker DNS resolves containerName within the shared network — no host port needed.
  const wsUrl = `ws://${containerName}:9000`;
  console.log(`[runner] Container ${containerId} on network ${network}, url=${wsUrl}`);

  redis.xadd('events', '*', 'data', JSON.stringify({
    ts: Date.now(), runId, teamId: data.teamId, level: 'info', event: 'container_started', containerId, wsUrl,
  })).catch(() => {});

  try {
    await waitForWs(wsUrl);
    console.log(`[runner] Engine ready at ${wsUrl}`);

    // Phase 1: serial correctness run
    const correctnessOrders = generateOrders(200, 42);
    const serialBot = new Bot(wsUrl, 'serial', runId, data.teamId, redis);
    const { results: actualResults, latencies: serialLatencies } = await serialBot.runSerial(correctnessOrders);

    const ref = new ReferenceEngine();
    const correctness = ref.validate(correctnessOrders, actualResults);
    console.log(`[runner] Correctness: ${(correctness * 100).toFixed(1)}%`);

    redis.xadd('events', '*', 'data', JSON.stringify({
      ts: Date.now(), runId, teamId: data.teamId, level: 'info', event: 'correctness_done',
      correctness: Math.round(correctness * 1000) / 1000,
    })).catch(() => {});

    // Phase 2: load test
    const fleet = new BotFleet(wsUrl, runId, redis);
    const { latencies: loadLatencies, tps } = await fleet.run(data.botCount ?? 50, 100);
    console.log(`[runner] Load test done: ${loadLatencies.length} acks, ${tps} TPS`);

    const allLatencies = [...serialLatencies, ...loadLatencies];
    const metrics = computeMetrics(allLatencies, 30_000);
    metrics.tps = tps;

    const score = await saveScore(data.teamId, runId, metrics, correctness);

    redis.xadd('events', '*', 'data', JSON.stringify({
      ts: Date.now(), runId, teamId: data.teamId, level: 'info', event: 'run_complete',
      score, correctness, metrics,
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
    // Order matters: remove container first (auto-disconnects it), then worker, then network.
    await removeContainer(containerId);
    await disconnectWorkerFromNetwork(network);
    await removeBenchNetwork(network);
    console.log(`[runner] Cleaned up container ${containerId} and network ${network}`);
  }
}
