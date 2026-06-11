import { Worker } from 'bullmq';
import { run } from './runner';

const connection = {
  host: process.env.REDIS_HOST ?? 'localhost',
  port: Number(process.env.REDIS_PORT ?? 6379),
};

const worker = new Worker('benchmark', async (job) => {
  await run(job.data as { teamId: string; zipPath: string });
}, { connection });

worker.on('failed', (job, err) => {
  console.error(`[worker] Job ${job?.id} failed:`, err.message);
});

worker.on('completed', (job) => {
  console.log(`[worker] Job ${job.id} completed`);
});

console.log('[worker] Listening for benchmark jobs');
