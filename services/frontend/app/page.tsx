'use client';

import { useEffect, useState, useRef } from 'react';
import * as Tabs from '@radix-ui/react-tabs';

// ── types ─────────────────────────────────────────────────────────────────────

interface Entry {
  rank: number;
  team: string;
  score: number;
  details?: {
    correctness?: number;
    metrics?: { p50: number; p90: number; p99: number; tps: number };
    timestamp?: number;
  };
}

interface LiveMetrics {
  tps: number | null;
  p99LatencyMs: number | null;
  acksLast10s: number;
  totalEventsStored: number;
  activeRuns: string[];
}

interface LogEntry {
  _id?: string;
  ts?: number;
  level?: string;
  event?: string;
  runId?: string;
  botId?: string;
  [key: string]: unknown;
}

// ── helpers ───────────────────────────────────────────────────────────────────

function bar(ratio: number, width = 10) {
  const filled = Math.round(Math.max(0, Math.min(1, ratio)) * width);
  return '[' + '|'.repeat(filled) + '.'.repeat(width - filled) + ']';
}

function scoreLabel(s: number) {
  if (s >= 800) return 'text-term-green glow';
  if (s >= 500) return 'text-term-amber';
  return 'text-term-error';
}

// ── sub-components ────────────────────────────────────────────────────────────

function LeaderboardTable({ entries }: { entries: Entry[] }) {
  if (entries.length === 0) {
    return (
      <pre className="text-term-muted text-xs py-8 text-center">
        {`  [EMPTY]  no submissions yet\n  > ./submit --file=engine.zip --team=yourteam`}
      </pre>
    );
  }

  return (
    <div style={{ overflowX: 'auto' }}>
      <div className="grid gap-x-3 text-xs tracking-widest mb-1 pb-1"
        style={{ gridTemplateColumns: '56px 1fr 70px 130px 72px 72px 84px',
          color: 'var(--term-muted)', borderBottom: '1px solid var(--term-border)' }}>
        <span>RANK</span>
        <span>TEAM</span>
        <span className="text-right">SCORE</span>
        <span className="text-right">CORRECTNESS</span>
        <span className="text-right">P99</span>
        <span className="text-right">TPS</span>
        <span className="text-right">TIME</span>
      </div>

      {entries.map((e, i) => {
        const m = e.details?.metrics;
        const corr = e.details?.correctness;
        const corrColor = corr == null ? 'var(--term-muted)'
          : corr >= 0.95 ? 'var(--term-green)'
          : corr >= 0.70 ? 'var(--term-amber)'
          : 'var(--term-error)';
        const corrGlow = corr == null ? 'none'
          : corr >= 0.95 ? 'var(--glow)'
          : corr >= 0.70 ? 'var(--glow-amber,0 0 6px rgba(255,176,0,0.5))'
          : '0 0 6px rgba(255,51,51,0.5)';

        return (
          <div key={e.team}
            className="grid gap-x-3 text-xs items-center py-1"
            style={{
              gridTemplateColumns: '56px 1fr 70px 130px 72px 72px 84px',
              borderBottom: '1px solid var(--term-dim)',
              background: i === 0 ? 'rgba(51,255,0,0.025)' : 'transparent',
            }}>
            <span style={{ color: i < 3 ? 'var(--term-green)' : 'var(--term-muted)',
              textShadow: i < 3 ? 'var(--glow)' : 'none' }}>
              [{String(i + 1).padStart(2, '0')}]
            </span>
            <span className="glow" style={{ color: 'var(--term-green)',
              fontWeight: i === 0 ? 'bold' : 'normal' }}>
              {e.team}
            </span>
            <span className={`text-right font-bold ${scoreLabel(e.score)}`}>{e.score}</span>
            <span className="text-right font-mono text-xs"
              style={{ color: corrColor, textShadow: corrGlow }}>
              {corr != null ? bar(corr) + ' ' + (corr * 100).toFixed(0) + '%' : '——'}
            </span>
            <span className="text-right"
              style={{ color: m?.p99 != null ? 'var(--term-green)' : 'var(--term-muted)',
                textShadow: m?.p99 != null ? 'var(--glow)' : 'none' }}>
              {m?.p99 != null ? m.p99 + 'ms' : '——'}
            </span>
            <span className="text-right"
              style={{ color: m?.tps != null ? 'var(--term-green)' : 'var(--term-muted)',
                textShadow: m?.tps != null ? 'var(--glow)' : 'none' }}>
              {m?.tps != null ? m.tps.toLocaleString() : '——'}
            </span>
            <span className="text-right text-[10px]" style={{ color: 'var(--term-muted)' }}>
              {e.details?.timestamp ? new Date(e.details.timestamp).toLocaleTimeString() : '——'}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function SubmitPanel() {
  const [team, setTeam] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [botCount, setBotCount] = useState(50);
  const [status, setStatus] = useState<'idle' | 'submitting' | 'ok' | 'err'>('idle');
  const [message, setMessage] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!team.trim() || !file) return;
    setStatus('submitting');
    setMessage('');
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('botCount', String(botCount));
      const res = await fetch(`/api/submit?team=${encodeURIComponent(team.trim())}`, {
        method: 'POST',
        body: fd,
      });
      const text = await res.text();
      if (!res.ok) throw new Error(text || `HTTP ${res.status}`);
      setStatus('ok');
      try { setMessage(JSON.stringify(JSON.parse(text), null, 2)); }
      catch { setMessage(text); }
    } catch (err) {
      setStatus('err');
      setMessage(String(err));
    }
  };

  const inputCls = `
    w-full bg-term-bg border border-term-border px-2 py-1.5
    text-term-green text-sm font-mono outline-none
    focus:border-term-green placeholder-term-muted
    caret-term-green
  `;

  return (
    <div style={{ maxWidth: '600px' }}>
      <pre className="text-[11px] mb-5" style={{ color: 'var(--term-muted)' }}>
{`# engine contract: WebSocket server on port 9000
# receives: NewLimit / NewMarket / Cancel  (JSON frames)
# replies:  Ack / Fill / Reject
# limits:   1 CPU  512 MB  no-internet
# see PROTOCOL.md for full message spec`}
      </pre>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <div className="text-[11px] mb-1" style={{ color: 'var(--term-muted)' }}>{'> TEAM_NAME'}</div>
          <div className="flex items-center gap-2">
            <span className="text-[11px]" style={{ color: 'var(--term-muted)', whiteSpace: 'nowrap' }}>
              bench:~$
            </span>
            <input type="text" value={team} onChange={e => setTeam(e.target.value)}
              placeholder="yourteam_" required className={inputCls} />
          </div>
        </div>

        <div>
          <div className="text-[11px] mb-1" style={{ color: 'var(--term-muted)' }}>
            {'> ENGINE_ZIP'}&nbsp;
            <span style={{ color: 'var(--term-dim, #0d2e0d)' }}>(Dockerfile must be at zip root)</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[11px]" style={{ color: 'var(--term-muted)', whiteSpace: 'nowrap' }}>
              bench:~$
            </span>
            <input type="file" accept=".zip" required
              onChange={e => setFile(e.target.files?.[0] ?? null)}
              className="w-full text-sm text-term-muted border border-term-border bg-term-bg px-2 py-1
                file:bg-term-green file:text-term-bg file:border-0 file:px-3 file:py-1
                file:text-xs file:font-mono file:cursor-pointer file:mr-3" />
          </div>
          {file && (
            <div className="text-[11px] mt-1 ml-20" style={{ color: 'var(--term-muted)' }}>
              loaded: {file.name} &nbsp;({(file.size / 1024).toFixed(1)} KB)
            </div>
          )}
        </div>

        <div>
          <div className="text-[11px] mb-1" style={{ color: 'var(--term-muted)' }}>
            {'> BOT_COUNT'}&nbsp;
            <span style={{ color: 'var(--term-muted)' }}>— bots hitting engine simultaneously (max 500)</span>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-[11px]" style={{ color: 'var(--term-muted)', whiteSpace: 'nowrap' }}>
              bench:~$
            </span>
            <input
              type="range" min={10} max={500} step={10}
              value={botCount}
              onChange={e => setBotCount(Number(e.target.value))}
              className="flex-1 accent-term-green"
            />
            <span className="text-sm font-mono glow" style={{ color: 'var(--term-green)', minWidth: '60px' }}>
              {botCount} bots
            </span>
          </div>
        </div>

        <button type="submit"
          disabled={status === 'submitting' || !team.trim() || !file}
          className="border border-term-green text-term-green bg-term-bg px-5 py-1.5 text-sm
            font-mono tracking-widest cursor-pointer
            hover:bg-term-green hover:text-term-bg
            disabled:opacity-30 disabled:cursor-not-allowed
            transition-colors"
          style={{ textShadow: 'none' }}>
          {status === 'submitting' ? '[ RUNNING... ]' : '[ ./submit --run ]'}
        </button>

        {message && (
          <pre className="text-[11px] p-3 whitespace-pre-wrap break-all"
            style={{
              border: `1px solid ${status === 'ok' ? 'var(--term-muted)' : 'var(--term-error)'}`,
              color: status === 'ok' ? 'var(--term-green)' : 'var(--term-error)',
              textShadow: status === 'ok' ? 'var(--glow)' : '0 0 6px rgba(255,51,51,0.5)',
            }}>
            {status === 'ok' ? '[OK] ' : '[ERR] '}{message}
          </pre>
        )}
      </form>

      <div className="mt-5 pt-4" style={{ borderTop: '1px dashed var(--term-muted)' }}>
        <div className="text-[10px] mb-1" style={{ color: 'var(--term-muted)' }}>-- curl equivalent --</div>
        <pre className="text-[11px] whitespace-pre-wrap break-all" style={{ color: 'var(--term-muted)' }}>
          {`curl -X POST -F "file=@engine.zip" -F "botCount=${botCount}" \\\n  "http://localhost:3000/submit?team=${team || 'yourteam'}"`}
        </pre>
      </div>
    </div>
  );
}

function LogsPanel() {
  const [metrics, setMetrics] = useState<LiveMetrics | null>(null);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [filter, setFilter] = useState({ runId: '', level: '' });
  const [metricsErr, setMetricsErr] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [autoScroll, setAutoScroll] = useState(true);

  useEffect(() => {
    let alive = true;

    const fetchAll = async () => {
      try {
        const params = new URLSearchParams({ limit: '300' });
        if (filter.runId) params.set('runId', filter.runId);
        if (filter.level) params.set('level', filter.level);

        const [mRes, lRes] = await Promise.all([
          fetch('/obs/metrics/live'),
          fetch(`/obs/logs?${params}`),
        ]);
        if (!alive) return;

        if (mRes.ok) { setMetrics(await mRes.json()); setMetricsErr(false); }
        else setMetricsErr(true);

        if (lRes.ok) {
          const data: LogEntry[] = await lRes.json();
          setLogs(data.reverse());
        }
      } catch {
        if (alive) setMetricsErr(true);
      }
    };

    fetchAll();
    const id = setInterval(fetchAll, 2000);
    return () => { alive = false; clearInterval(id); };
  }, [filter.runId, filter.level]);

  useEffect(() => {
    if (autoScroll && scrollRef.current) {
      scrollRef.current.scrollTop = 0;
    }
  }, [logs, autoScroll]);

  const levelColor = (level?: string) => {
    if (level === 'error') return 'var(--term-error)';
    if (level === 'warn') return 'var(--term-amber)';
    return 'var(--term-green)';
  };

  return (
    <div className="flex flex-col gap-3">
      {/* metrics bar */}
      <div className="flex gap-6 text-[11px] px-3 py-2"
        style={{ border: '1px solid var(--term-border)', background: 'rgba(51,255,0,0.03)' }}>
        {metricsErr ? (
          <span style={{ color: 'var(--term-error)' }}>[ERR] observability unreachable</span>
        ) : metrics ? (
          <>
            <span>TPS: <span className="glow" style={{ color: 'var(--term-green)' }}>{metrics.tps ?? '—'}</span></span>
            <span>p99: <span style={{ color: 'var(--term-green)' }}>{metrics.p99LatencyMs != null ? metrics.p99LatencyMs + 'ms' : '—'}</span></span>
            <span>acks/10s: <span style={{ color: 'var(--term-green)' }}>{metrics.acksLast10s}</span></span>
            <span>stored: <span style={{ color: 'var(--term-green)' }}>{metrics.totalEventsStored}</span></span>
            {metrics.activeRuns?.length > 0 && (
              <span>run: <span className="glow" style={{ color: 'var(--term-green)' }}>{metrics.activeRuns[0]}</span></span>
            )}
          </>
        ) : (
          <span style={{ color: 'var(--term-muted)' }}>loading metrics<span className="cursor">█</span></span>
        )}
      </div>

      {/* filters */}
      <div className="flex gap-3 text-[11px]">
        <div className="flex items-center gap-2">
          <span style={{ color: 'var(--term-muted)' }}>run:</span>
          <input
            value={filter.runId}
            onChange={e => setFilter(f => ({ ...f, runId: e.target.value }))}
            placeholder="filter by run-id"
            className="bg-term-bg border border-term-border px-2 py-0.5 text-term-green
              font-mono outline-none focus:border-term-green placeholder-term-muted w-52"
            style={{ fontSize: '11px' }}
          />
        </div>
        <div className="flex items-center gap-2">
          <span style={{ color: 'var(--term-muted)' }}>level:</span>
          <select
            value={filter.level}
            onChange={e => setFilter(f => ({ ...f, level: e.target.value }))}
            className="bg-term-bg border border-term-border px-2 py-0.5 text-term-green font-mono outline-none"
            style={{ fontSize: '11px' }}>
            <option value="">all</option>
            <option value="info">info</option>
            <option value="warn">warn</option>
            <option value="error">error</option>
          </select>
        </div>
        <label className="flex items-center gap-1.5 ml-auto cursor-pointer" style={{ color: 'var(--term-muted)' }}>
          <input type="checkbox" checked={autoScroll} onChange={e => setAutoScroll(e.target.checked)}
            className="accent-term-green" />
          auto-scroll
        </label>
      </div>

      {/* log entries */}
      <div ref={scrollRef} style={{ height: '52vh', overflowY: 'auto', border: '1px solid var(--term-border)' }}>
        {logs.length === 0 ? (
          <pre className="text-[11px] text-center py-8" style={{ color: 'var(--term-muted)' }}>
            [EMPTY] no events yet — submit an engine to see live logs
          </pre>
        ) : (
          logs.map((entry, i) => {
            const ts = entry.ts ? new Date(entry.ts).toISOString().slice(11, 23) : '';
            const line = JSON.stringify(entry);
            return (
              <div key={entry._id ?? i}
                className="text-[11px] px-3 py-0.5 font-mono"
                style={{
                  borderBottom: '1px solid var(--term-dim)',
                  color: levelColor(entry.level),
                  wordBreak: 'break-all',
                }}>
                <span style={{ color: 'var(--term-muted)', marginRight: '8px' }}>{ts}</span>
                {line}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

// ── main ──────────────────────────────────────────────────────────────────────

export default function HomePage() {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetch_ = async () => {
      try {
        const res = await fetch('/api/leaderboard');
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        setEntries(await res.json());
        setLastRefresh(new Date());
        setError(null);
      } catch (e) { setError(String(e)); }
    };
    fetch_();
    const id = setInterval(fetch_, 1000);
    return () => clearInterval(id);
  }, []);

  return (
    <Tabs.Root defaultValue="leaderboard">
      {/* status line */}
      <div className="flex justify-between text-[11px] mb-2" style={{ color: 'var(--term-muted)' }}>
        <span>
          {'> '}<span className="glow" style={{ color: 'var(--term-green)' }}>{entries.length}</span>
          {' submissions ranked   score=0.6×correctness+0.4×latency   max=1000'}
          {error && <span className="ml-3" style={{ color: 'var(--term-error)' }}>[ERR] {error}</span>}
        </span>
        <span>
          {lastRefresh
            ? <>last=<span style={{ color: 'var(--term-green)' }}>{lastRefresh.toLocaleTimeString()}</span></>
            : <span style={{ color: 'var(--term-muted)' }}>connecting...</span>}
        </span>
      </div>

      {/* tabs */}
      <Tabs.List className="flex gap-0.5 mb-0">
        {[
          { value: 'leaderboard', label: '[./rank]' },
          { value: 'submit',      label: '[./submit]' },
          { value: 'logs',        label: '[./logs]' },
        ].map(({ value, label }) => (
          <Tabs.Trigger key={value} value={value}
            className="text-[11px] px-4 py-1.5 font-mono tracking-wider border border-b-0 cursor-pointer
              border-term-muted text-term-muted bg-term-bg
              data-[state=active]:bg-term-green data-[state=active]:text-term-bg
              data-[state=active]:border-term-green
              hover:text-term-green transition-colors">
            {label}
          </Tabs.Trigger>
        ))}
      </Tabs.List>

      {/* panel */}
      <div style={{ border: '1px solid var(--term-muted)', padding: '16px' }}>
        <Tabs.Content value="leaderboard">
          <LeaderboardTable entries={entries} />
        </Tabs.Content>
        <Tabs.Content value="submit">
          <SubmitPanel />
        </Tabs.Content>
        <Tabs.Content value="logs">
          <LogsPanel />
        </Tabs.Content>
      </div>
    </Tabs.Root>
  );
}
