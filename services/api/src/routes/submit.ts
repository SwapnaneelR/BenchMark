import { FastifyPluginAsync } from 'fastify';
import { pipeline } from 'stream/promises';
import { createWriteStream } from 'fs';
import { mkdir } from 'fs/promises';
import path from 'path';
import { benchmarkQueue } from '../queue';

export const submitRoute: FastifyPluginAsync = async (app) => {
  app.post('/submit', async (req, reply) => {
    const data = await req.file();
    if (!data) return reply.status(400).send({ error: 'No file uploaded' });

    const teamId = ((req.query as Record<string, string>).team ?? 'anonymous').replace(/[^a-z0-9_-]/gi, '_');
    const submitDir = path.join('/submissions', teamId, Date.now().toString());
    await mkdir(submitDir, { recursive: true });

    const zipPath = path.join(submitDir, 'submission.zip');
    await pipeline(data.file, createWriteStream(zipPath));

    const job = await benchmarkQueue.add('run', { teamId, zipPath });
    reply.send({ jobId: job.id, team: teamId });
  });
};
