// Tide ORK Network status aggregator — no dependencies (Node 20+ global fetch).
// Polls ork1..orkN.<domain>/active, rolls the fleet into ONE network status,
// and writes small JSON files the static status page reads. Run from repo root.
import { readFile, writeFile, mkdir } from 'node:fs/promises';

const DOMAIN        = process.env.ORK_DOMAIN || 'tideprotocol.com';
const NODE_COUNT    = Number(process.env.ORK_COUNT || 25);
const HEALTH_PATH   = '/active';
const TIMEOUT_MS    = Number(process.env.ORK_TIMEOUT_MS || 8000);
// The network is "available" while at least this many nodes respond. Below it = major outage.
// Tune to the network's real operating quorum.
const AVAILABLE_MIN = Number(process.env.ORK_AVAILABLE_MIN || 15);

const RECENT_MAX = 288; // ~24h at a 5-min cadence
const DAILY_MAX  = 90;  // 90-day rollup

async function checkNode(i) {
  const url = `https://ork${i}.${DOMAIN}${HEALTH_PATH}`;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  const started = Date.now();
  try {
    const res = await fetch(url, { signal: ctrl.signal, headers: { 'user-agent': 'tide-status/1' } });
    const ms = Date.now() - started;
    let up = res.ok;
    if (up) { try { const body = await res.json(); up = body?.status === 'UP'; } catch { up = false; } }
    return { up, ms };
  } catch {
    return { up: false, ms: Date.now() - started };
  } finally {
    clearTimeout(timer);
  }
}

async function loadJson(path, fallback) {
  try { return JSON.parse(await readFile(path, 'utf8')); } catch { return fallback; }
}

function uptimeFromDaily(daily, days) {
  const slice = daily.slice(-days);
  const checks = slice.reduce((a, d) => a + d.checks, 0);
  const up = slice.reduce((a, d) => a + d.up, 0);
  return checks ? Number(((up / checks) * 100).toFixed(3)) : null;
}

const results = await Promise.all(Array.from({ length: NODE_COUNT }, (_, k) => checkNode(k + 1)));
const total = NODE_COUNT;
const up = results.filter(r => r.up).length;
const upMs = results.filter(r => r.up).map(r => r.ms);
const avgMs = upMs.length ? Math.round(upMs.reduce((a, b) => a + b, 0) / upMs.length) : null;

const status = up === total ? 'operational' : (up >= AVAILABLE_MIN ? 'degraded' : 'major');
const available = status !== 'major';

const iso = new Date().toISOString();
const day = iso.slice(0, 10);

await mkdir('data', { recursive: true });
const history = await loadJson('data/history.json', { daily: [], recent: [] });
history.recent ||= [];
history.daily ||= [];

history.recent.push({ t: iso, up, total, ms: avgMs, ok: available });
if (history.recent.length > RECENT_MAX) history.recent = history.recent.slice(-RECENT_MAX);

let today = history.daily[history.daily.length - 1];
if (!today || today.date !== day) {
  today = { date: day, checks: 0, up: 0 };
  history.daily.push(today);
  if (history.daily.length > DAILY_MAX) history.daily = history.daily.slice(-DAILY_MAX);
}
today.checks += 1;
today.up += available ? 1 : 0;

const recentOk = history.recent.filter(r => r.ok).length;
const uptime24h = history.recent.length ? Number(((recentOk / history.recent.length) * 100).toFixed(3)) : null;

const snapshot = {
  updatedAt: iso,
  status, up, total, avgMs,
  uptime24h,
  uptime7d: uptimeFromDaily(history.daily, 7),
  uptime90d: uptimeFromDaily(history.daily, 90),
  availableMin: AVAILABLE_MIN,
};

await writeFile('data/status.json', JSON.stringify(snapshot, null, 2) + '\n');
await writeFile('data/history.json', JSON.stringify(history) + '\n');

console.log(`ORK network: ${status.toUpperCase()} — ${up}/${total} up, avg ${avgMs ?? '-'}ms`);
