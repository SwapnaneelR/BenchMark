import { Router } from 'express';
import { redis } from '../redis';

export const teamRouter = Router();

teamRouter.post('/team/join', async (req, res) => {
  const raw = typeof req.body?.name === 'string' ? req.body.name : '';
  const name = raw.trim().replace(/[^a-z0-9_-]/gi, '_').slice(0, 64);

  if (name.length < 2) {
    res.status(400).json({ error: 'Team name must be 2–64 chars (letters, digits, _ -)' });
    return;
  }

  const key = `team:reg:${name}`;
  const existed = await redis.get(key);
  if (!existed) {
    await redis.set(key, '1');
    console.log(`[team] registered "${name}"`);
  }

  res.json({ teamId: name, name });
});
