import express from 'express';
import cors from 'cors';
import Redis from 'ioredis';

const redis = new Redis({
  host: process.env.REDIS_HOST ?? 'localhost',
  port: Number(process.env.REDIS_PORT ?? 6379),
  maxRetriesPerRequest: null,
});

const MAX_EVENTS = 10_000;
const events: object[] = [];
let lastId = '0';

async function consumeStream() {
  while (true) {
    try {
      const results = await redis.xread('COUNT', 200, 'BLOCK', 2000, 'STREAMS', 'events', lastId) as any;
      if (results) {
        for (const [, entries] of results) {
          for (const [id, fields] of entries as [string, string[]][]) {
            lastId = id;
            try {
              const dataIdx = fields.indexOf('data');
              if (dataIdx !== -1) {
                const parsed = JSON.parse(fields[dataIdx + 1]);
                events.push({ _id: id, ...parsed });
                if (events.length > MAX_EVENTS) events.splice(0, events.length - MAX_EVENTS);
              }
            } catch { /* ignore malformed */ }
          }
        }
      }
    } catch (err) {
      console.error('[obs] stream error:', err);
      await new Promise(r => setTimeout(r, 2000));
    }
  }
}

const app = express();
app.use(cors());
app.use(express.json());

app.get('/logs', (req, res) => {
  const { runId, botId, level, q, limit, teamId } = req.query as Record<string, string>;
  const max = Math.min(parseInt(limit ?? '500'), 2000);

  let filtered = events as any[];
  if (teamId) filtered = filtered.filter(e => e.teamId === teamId);
  if (runId) filtered = filtered.filter(e => e.runId === runId);
  if (botId) filtered = filtered.filter(e => e.botId === botId);
  if (level) filtered = filtered.filter(e => e.level === level);
  if (q) {
    const lower = q.toLowerCase();
    filtered = filtered.filter(e => JSON.stringify(e).toLowerCase().includes(lower));
  }

  res.json(filtered.slice(-max));
});

app.get('/metrics/live', (req, res) => {
  const { teamId } = req.query as Record<string, string>;
  const now = Date.now();
  let window10s = (events as any[]).filter(e => now - (e.ts ?? 0) < 10_000);
  if (teamId) window10s = window10s.filter(e => e.teamId === teamId);

  const runs = new Set(window10s.map(e => e.runId).filter(Boolean));
  const latencies = window10s.filter(e => e.event === 'ack' && typeof e.latencyMs === 'number').map(e => e.latencyMs as number);
  const sorted = [...latencies].sort((a, b) => a - b);
  const p99 = sorted.length ? sorted[Math.floor(sorted.length * 0.99)] : null;
  const tps = latencies.length > 0 ? Math.round(latencies.length / 10) : 0;

  res.json({
    activeRuns: [...runs],
    acksLast10s: latencies.length,
    tps,
    p99LatencyMs: p99,
    totalEventsStored: events.length,
  });
});

app.get('/', (_req, res) => {
  res.send(`<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>BenchMark Observability</title>
<style>
  body { font-family: monospace; background: #0f0f0f; color: #e2e2e2; margin: 0; padding: 16px; }
  h1 { color: #60a5fa; margin: 0 0 12px; }
  #controls { display: flex; gap: 8px; margin-bottom: 12px; flex-wrap: wrap; }
  input, select, button { background: #1e1e1e; color: #e2e2e2; border: 1px solid #333; padding: 4px 8px; border-radius: 4px; font-family: monospace; }
  button { cursor: pointer; background: #2563eb; border-color: #2563eb; }
  button:hover { background: #1d4ed8; }
  #metrics { background: #1e1e1e; padding: 8px 12px; border-radius: 6px; margin-bottom: 12px; font-size: 0.85rem; display: flex; gap: 24px; }
  #log-container { height: calc(100vh - 200px); overflow-y: auto; background: #1e1e1e; border-radius: 6px; padding: 8px; }
  .entry { padding: 2px 0; border-bottom: 1px solid #222; font-size: 0.78rem; white-space: pre-wrap; word-break: break-all; }
  .info { color: #86efac; }
  .warn { color: #fde68a; }
  .error { color: #fca5a5; }
  .ts { color: #94a3b8; margin-right: 8px; }
</style>
</head>
<body>
<h1>BenchMark Observability</h1>
<div id="metrics">Loading metrics…</div>
<div id="controls">
  <input id="runId" placeholder="Run ID" />
  <input id="botId" placeholder="Bot ID" />
  <select id="level"><option value="">All levels</option><option>info</option><option>warn</option><option>error</option></select>
  <input id="q" placeholder="Search text" />
  <button onclick="fetchLogs()">Refresh</button>
  <label><input type="checkbox" id="autoRefresh" checked> Auto (2s)</label>
</div>
<div id="log-container"></div>
<script>
const BASE = window.location.origin + window.location.pathname.replace(/\/+$/, '');
async function fetchMetrics() {
  const r = await fetch(BASE + '/metrics/live');
  const m = await r.json();
  document.getElementById('metrics').innerHTML =
    'TPS: <b>' + (m.tps ?? '-') + '</b> &nbsp;|&nbsp; p99: <b>' + (m.p99LatencyMs ?? '-') + 'ms</b>' +
    ' &nbsp;|&nbsp; Acks/10s: <b>' + m.acksLast10s + '</b>' +
    ' &nbsp;|&nbsp; Stored: <b>' + m.totalEventsStored + '</b>' +
    (m.activeRuns?.length ? ' &nbsp;|&nbsp; Run: <b>' + m.activeRuns[0] + '</b>' : '');
}

async function fetchLogs() {
  const params = new URLSearchParams();
  ['runId','botId','level','q'].forEach(k => { const v = document.getElementById(k).value; if (v) params.set(k, v); });
  params.set('limit', '300');
  const r = await fetch(BASE + '/logs?' + params);
  const logs = await r.json();
  const c = document.getElementById('log-container');
  c.innerHTML = logs.reverse().map(e => {
    const ts = e.ts ? new Date(e.ts).toISOString().slice(11,23) : '';
    const level = e.level ?? 'info';
    return '<div class="entry ' + level + '"><span class="ts">' + ts + '</span>' + JSON.stringify(e) + '</div>';
  }).join('');
}

let timer = setInterval(() => {
  if (document.getElementById('autoRefresh').checked) { fetchLogs(); fetchMetrics(); }
}, 2000);
fetchLogs(); fetchMetrics();
</script>
</body>
</html>`);
});

const port = Number(process.env.OBS_PORT ?? 3002);
app.listen(port, '0.0.0.0', () => console.log(`Observability on port ${port}`));
consumeStream().catch(console.error);
