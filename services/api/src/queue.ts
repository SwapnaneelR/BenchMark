import { Queue } from 'bullmq';

const connection = {
  host: process.env.REDIS_HOST ?? 'localhost',
  port: Number(process.env.REDIS_PORT ?? 6379),
};

export const benchmarkQueue = new Queue('benchmark', {
  connection,
  defaultJobOptions: { attempts: 1, removeOnComplete: 100, removeOnFail: 50 },
});
