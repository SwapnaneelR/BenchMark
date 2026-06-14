import { Router } from 'express';
import { redis } from '../redis';

export const logsRouter = Router();

const OBS_BASE = `http://${process.env.OBS_HOST ?? 'observability'}:${process.env.OBS_PORT ?? 3002}`;

function extractTeamId(req: import('express').Request): string {
  return (req.headers['x-team-id'] ?? '').toString()
    .replace(/[^a-z0-9_-]/gi, '_').slice(0, 64);
}

async function validateTeam(teamId: string): Promise<boolean> {
  if (!teamId) return false;
  const registered = await redis.get(`team:reg:${teamId}`);
  return !!registered;
}

logsRouter.get('/logs', async (req, res) => {
  const teamId = extractTeamId(req);
  if (!teamId) { res.status(401).json({ error: 'Missing X-Team-Id header' }); return; }
  if (!await validateTeam(teamId)) { res.status(403).json({ error: 'Team not registered' }); return; }

  const params = new URLSearchParams();
  params.set('teamId', teamId);
  if (req.query.runId) params.set('runId', String(req.query.runId));
  if (req.query.level) params.set('level', String(req.query.level));
  if (req.query.limit) params.set('limit', String(req.query.limit));

  const upstream = await fetch(`${OBS_BASE}/logs?${params}`);
  const data = await upstream.json();
  res.status(upstream.status).json(data);
});

logsRouter.get('/metrics/live', async (req, res) => {
  const teamId = extractTeamId(req);
  if (!teamId) { res.status(401).json({ error: 'Missing X-Team-Id header' }); return; }
  if (!await validateTeam(teamId)) { res.status(403).json({ error: 'Team not registered' }); return; }

  const upstream = await fetch(`${OBS_BASE}/metrics/live?teamId=${encodeURIComponent(teamId)}`);
  const data = await upstream.json();
  res.status(upstream.status).json(data);
});
