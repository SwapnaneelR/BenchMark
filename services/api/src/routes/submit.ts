import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import { mkdir, rename } from 'fs/promises';
import { benchmarkQueue } from '../queue';
import { redis } from '../redis';

const upload = multer({ dest: '/submissions/tmp/', limits: { fileSize: 50 * 1024 * 1024 } });

export const submitRouter = Router();

submitRouter.post('/submit', upload.single('file'), async (req, res) => {
  if (!req.file) {
    res.status(400).json({ error: 'No file uploaded. Send zip as multipart field "file".' });
    return;
  }

  // Team identity comes from X-Team-Id header (set by frontend after /team/join).
  const teamId = (req.headers['x-team-id'] ?? '').toString()
    .replace(/[^a-z0-9_-]/gi, '_').slice(0, 64);

  if (!teamId) {
    res.status(401).json({ error: 'Missing X-Team-Id header. Visit the platform and join first.' });
    return;
  }

  const registered = await redis.get(`team:reg:${teamId}`);
  if (!registered) {
    res.status(403).json({ error: `Team "${teamId}" not registered. Join via the platform first.` });
    return;
  }

  const rawBots = typeof req.body?.botCount === 'string' ? req.body.botCount : '';
  const botCount = Math.min(500, Math.max(1, parseInt(rawBots) || 50));

  const submitDir = path.join('/submissions', teamId, Date.now().toString());
  await mkdir(submitDir, { recursive: true });

  const zipPath = path.join(submitDir, 'submission.zip');
  await rename(req.file.path, zipPath);

  const job = await benchmarkQueue.add('run', { teamId, zipPath, botCount });
  res.json({ jobId: job.id, team: teamId, zipPath, botCount });
});
