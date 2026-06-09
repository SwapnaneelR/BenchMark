import { Queue } from 'bullmq';
import { redis } from './redis';

export const benchmarkQueue = new Queue('benchmark', {
  connection: redis,
  defaultJobOptions: { attempts: 1, removeOnComplete: 100, removeOnFail: 50 },
});
