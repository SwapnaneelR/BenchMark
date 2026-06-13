import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import { mkdir, rename } from 'fs/promises';
import { benchmarkQueue } from '../queue';

const upload = multer({ dest: '/submissions/tmp/', limits: { fileSize: 50 * 1024 * 1024 } });

export const submitRouter = Router();

submitRouter.post('/submit', upload.single('file'), async (req, res) => {
  if (!req.file) {
    res.status(400).json({ error: 'No file uploaded. Send zip as multipart field "file".' });
    return;
  }

  const team = (typeof req.query.team === 'string' ? req.query.team : 'anonymous')
    .replace(/[^a-z0-9_-]/gi, '_')
    .slice(0, 64);

  const rawBots = typeof req.body?.botCount === 'string' ? req.body.botCount : '';
  const botCount = Math.min(500, Math.max(1, parseInt(rawBots) || 50));

  const submitDir = path.join('/submissions', team, Date.now().toString());
  await mkdir(submitDir, { recursive: true });

  const zipPath = path.join(submitDir, 'submission.zip');

  await rename(req.file.path, zipPath);

  const job = await benchmarkQueue.add('run', { teamId: team, zipPath, botCount });
  res.json({ jobId: job.id, team, zipPath, botCount });
});
