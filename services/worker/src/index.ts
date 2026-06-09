import { Worker } from 'bullmq';
import { redis } from './redis';
import { run } from './runner';

const worker = new Worker('benchmark', async (job) => {
  await run(job.data);
}, { connection: redis });

worker.on('failed', (job, err) => {
  console.error(`Job ${job?.id} failed:`, err);
});
