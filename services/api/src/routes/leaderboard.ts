import { FastifyPluginAsync } from 'fastify';
import { redis } from '../redis';

export const leaderboardRoute: FastifyPluginAsync = async (app) => {
  app.get('/leaderboard', async (_req, reply) => {
    const raw = await redis.zrevrange('leaderboard', 0, 49, 'WITHSCORES');
    const entries: { team: string; score: number }[] = [];
    for (let i = 0; i < raw.length; i += 2) {
      entries.push({ team: raw[i], score: parseFloat(raw[i + 1]) });
    }
    reply.send(entries);
  });
};
