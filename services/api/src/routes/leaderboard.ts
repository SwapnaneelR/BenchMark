import { Router } from 'express';
import { redis } from '../redis';

export const leaderboardRouter = Router();

leaderboardRouter.get('/leaderboard', async (_req, res) => {
  const raw = await redis.zrevrange('leaderboard', 0, 49, 'WITHSCORES');
  const entries: { rank: number; team: string; score: number; details?: object }[] = [];
  for (let i = 0; i < raw.length; i += 2) {
    const team = raw[i];
    const score = parseFloat(raw[i + 1]);
    let details: object | undefined;
    try {
      const runId = await redis.get(`team:${team}:lastRun`);
      if (runId) {
        const d = await redis.get(`run:${runId}`);
        if (d) details = JSON.parse(d);
      }
    } catch { /* ignore */ }
    entries.push({ rank: entries.length + 1, team, score, details });
  }
  res.json(entries);
});
