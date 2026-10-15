# Tide Network Status

Public status page for the **Tide ORK network** — `https://status.tideprotocol.com`.

Zero infrastructure: a scheduled **GitHub Action** polls every ORK's liveness endpoint,
rolls the whole fleet into a **single network-wide status**, and a static page on
**GitHub Pages** shows it. No servers, no database, nothing to bill.

## How it works

- Every ~5 minutes, [`scripts/check.mjs`](scripts/check.mjs) GETs
  `https://ork{1..N}.tideprotocol.com/active` (the ORK liveness endpoint — `200` + `{"status":"UP"}`).
- It counts healthy nodes, applies a threshold, and writes two small files:
  - `data/status.json` — current snapshot (status, up/total, avg response, uptime 24h/7d/90d).
  - `data/history.json` — rolling 90-day daily rollup + last 24h of checks.
- [`index.html`](index.html) reads those and renders the page (and auto-refreshes every minute).
- Per-node detail is **never exposed** here — the public page only shows the aggregate.

## Configuration

Set as workflow env or edit the defaults in `scripts/check.mjs`:

| Variable | Default | Meaning |
|---|---|---|
| `ORK_DOMAIN` | `tideprotocol.com` | Base domain; nodes are `ork{i}.<domain>` |
| `ORK_COUNT` | `25` | Number of nodes — **bump this as the network grows** |
| `ORK_AVAILABLE_MIN` | `15` | Below this many nodes up = **major outage** (tune to the real operating quorum) |
| `ORK_TIMEOUT_MS` | `8000` | Per-node request timeout |

Status thresholds: all up → **operational**; some down but ≥ `ORK_AVAILABLE_MIN` → **degraded**; below it → **major outage**.

## Setup

1. Enable **GitHub Pages** → deploy from branch `main`, folder `/` (root).
2. Add a DNS **CNAME**: `status.tideprotocol.com` → `tide-foundation.github.io`. (`CNAME` file is already in the repo.)
3. The Action runs on a schedule, on manual dispatch, and on push.
