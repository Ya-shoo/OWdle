#!/usr/bin/env node
// Local-only admin viewer for the shared votes DB. Reads ADMIN_SECRET
// from .env.secrets, proxies to playowdle.com's admin endpoints with
// the Bearer header server-side, and serves a single HTML page bound
// to 127.0.0.1 only (so the secret never leaves the machine).
//
// Usage:
//   npm run votes:admin
//     → http://localhost:8788

import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "..");

function readSecret() {
  const path = resolve(repoRoot, ".env.secrets");
  let raw;
  try {
    raw = readFileSync(path, "utf8");
  } catch {
    throw new Error(`Could not read ${path}. Is .env.secrets present?`);
  }
  for (const line of raw.split("\n")) {
    if (line.trim().startsWith("#")) continue;
    const m = line.match(/^\s*ADMIN_SECRET\s*=\s*["']?([^"'\n\r]+?)["']?\s*$/);
    if (m) return m[1];
  }
  throw new Error("ADMIN_SECRET not found in .env.secrets");
}

const SECRET = readSecret();
const ORIGIN = process.env.VOTES_ADMIN_ORIGIN ?? "https://playowdle.com";
const PORT = Number(process.env.VOTES_ADMIN_PORT ?? 8788);

const HTML = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>Votes admin · OWdle + Deadlockle</title>
<meta name="viewport" content="width=device-width,initial-scale=1" />
<style>
  :root {
    --bg: #0c0d10;
    --panel: #14161b;
    --panel-2: #1b1e25;
    --border: #262a33;
    --text: #e7e9ee;
    --muted: #8a91a0;
    --accent: #ff8a3c;
    --owdle: #ff8a3c;
    --deadlockle: #6ea3ff;
  }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; }
  body {
    background: var(--bg);
    color: var(--text);
    font: 14px/1.5 ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
    min-height: 100vh;
    padding: 24px;
  }
  h1 {
    font-size: 18px;
    font-weight: 600;
    margin: 0 0 4px 0;
    letter-spacing: -0.01em;
  }
  .sub { color: var(--muted); font-size: 13px; margin-bottom: 24px; }
  .totals {
    display: flex; gap: 12px; flex-wrap: wrap; margin-bottom: 20px;
  }
  .stat {
    background: var(--panel);
    border: 1px solid var(--border);
    border-radius: 10px;
    padding: 12px 16px;
    min-width: 140px;
  }
  .stat .label { color: var(--muted); font-size: 12px; text-transform: uppercase; letter-spacing: 0.06em; }
  .stat .value { font-size: 22px; font-weight: 600; margin-top: 2px; }
  .controls {
    display: flex; gap: 10px; align-items: center; flex-wrap: wrap;
    margin-bottom: 16px;
  }
  .controls select, .controls button {
    background: var(--panel);
    color: var(--text);
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 8px 12px;
    font: inherit;
    cursor: pointer;
  }
  .controls button:hover { border-color: var(--accent); }
  .controls .meta { color: var(--muted); margin-left: auto; font-size: 12px; }
  .grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 20px;
  }
  @media (max-width: 1100px) {
    .grid { grid-template-columns: 1fr; }
  }
  .card {
    background: var(--panel);
    border: 1px solid var(--border);
    border-radius: 12px;
    overflow: hidden;
  }
  .card h2 {
    margin: 0;
    padding: 14px 16px;
    font-size: 13px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: var(--muted);
    border-bottom: 1px solid var(--border);
    background: var(--panel-2);
  }
  table { width: 100%; border-collapse: collapse; }
  th, td {
    text-align: left;
    padding: 10px 16px;
    border-bottom: 1px solid var(--border);
    font-size: 13px;
  }
  th {
    color: var(--muted);
    font-weight: 500;
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.06em;
  }
  tr:last-child td { border-bottom: none; }
  td.num { text-align: right; font-variant-numeric: tabular-nums; }
  td.hash { font-family: ui-monospace, "SF Mono", Menlo, monospace; color: var(--muted); font-size: 12px; }
  td.time { color: var(--muted); font-variant-numeric: tabular-nums; white-space: nowrap; }
  .pill {
    display: inline-block;
    padding: 2px 8px;
    border-radius: 999px;
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.04em;
    text-transform: uppercase;
  }
  .pill.owdle { background: rgba(255,138,60,0.12); color: var(--owdle); border: 1px solid rgba(255,138,60,0.3); }
  .pill.deadlockle { background: rgba(110,163,255,0.12); color: var(--deadlockle); border: 1px solid rgba(110,163,255,0.3); }
  .split { color: var(--muted); font-size: 12px; }
  .split .o { color: var(--owdle); }
  .split .d { color: var(--deadlockle); }
  .empty { padding: 24px 16px; color: var(--muted); text-align: center; }
  .err { background: #2a1115; border: 1px solid #642228; color: #ffb1b1; padding: 12px 16px; border-radius: 8px; margin-bottom: 16px; }
  .game { color: var(--text); }
  .game small { color: var(--muted); display: block; font-size: 11px; }
</style>
</head>
<body>
  <h1>Votes admin</h1>
  <div class="sub">Shared <code>owdle-votes</code> D1 · proxied through localhost so your secret stays on disk</div>

  <div class="totals" id="totals"></div>

  <div class="controls">
    <label>Source
      <select id="source">
        <option value="">all</option>
        <option value="owdle">owdle</option>
        <option value="deadlockle">deadlockle</option>
      </select>
    </label>
    <label>Window
      <select id="since">
        <option value="0">all time</option>
        <option value="86400">last 24h</option>
        <option value="604800">last 7d</option>
        <option value="2592000">last 30d</option>
      </select>
    </label>
    <label>Limit
      <select id="limit">
        <option>50</option>
        <option selected>200</option>
        <option>500</option>
        <option>1000</option>
        <option>2000</option>
      </select>
    </label>
    <button id="refresh">Refresh</button>
    <span class="meta" id="meta"></span>
  </div>

  <div id="error" class="err" hidden></div>

  <div class="grid">
    <div class="card">
      <h2>Top games (combined)</h2>
      <table id="agg">
        <thead><tr><th>#</th><th>Game</th><th class="num">Total</th><th class="num">Split</th></tr></thead>
        <tbody></tbody>
      </table>
    </div>
    <div class="card">
      <h2>Recent activity</h2>
      <table id="raw">
        <thead><tr><th>When</th><th>Source</th><th>Game</th><th>Voter</th></tr></thead>
        <tbody></tbody>
      </table>
    </div>
  </div>

<script>
const $ = (sel) => document.querySelector(sel);
const els = {
  totals: $("#totals"),
  source: $("#source"),
  since: $("#since"),
  limit: $("#limit"),
  refresh: $("#refresh"),
  meta: $("#meta"),
  error: $("#error"),
  agg: $("#agg tbody"),
  raw: $("#raw tbody"),
};

function fmtTime(unix) {
  const d = new Date(unix * 1000);
  const now = Date.now();
  const diff = (now - d.getTime()) / 1000;
  if (diff < 60) return Math.floor(diff) + "s ago";
  if (diff < 3600) return Math.floor(diff / 60) + "m ago";
  if (diff < 86400) return Math.floor(diff / 3600) + "h ago";
  if (diff < 604800) return Math.floor(diff / 86400) + "d ago";
  return d.toLocaleString();
}

function pill(source) {
  return '<span class="pill ' + source + '">' + source + '</span>';
}

function showError(msg) {
  els.error.hidden = false;
  els.error.textContent = msg;
}
function clearError() { els.error.hidden = true; els.error.textContent = ""; }

async function load() {
  clearError();
  const source = els.source.value;
  const sinceSec = Number(els.since.value);
  const limit = Number(els.limit.value);
  const sinceUnix = sinceSec === 0 ? 0 : Math.floor(Date.now() / 1000) - sinceSec;

  const rawQs = new URLSearchParams({ limit: String(limit), since: String(sinceUnix) });
  if (source) rawQs.set("source", source);

  els.meta.textContent = "Loading…";
  try {
    const [aggResp, rawResp] = await Promise.all([
      fetch("/api/votes"),
      fetch("/api/votes-raw?" + rawQs),
    ]);
    if (!aggResp.ok) throw new Error("votes: " + aggResp.status + " " + await aggResp.text());
    if (!rawResp.ok) throw new Error("votes-raw: " + rawResp.status + " " + await rawResp.text());
    const agg = (await aggResp.json()).results ?? [];
    const raw = (await rawResp.json()).results ?? [];

    const totalAll = agg.reduce((n, r) => n + (r.votes ?? 0), 0);
    const totalOwdle = agg.reduce((n, r) => n + (r.votes_owdle ?? 0), 0);
    const totalDeadlockle = agg.reduce((n, r) => n + (r.votes_deadlockle ?? 0), 0);
    const distinctVoters = new Set(raw.map((r) => r.voter_hash)).size;

    els.totals.innerHTML = [
      ['Total votes', totalAll],
      ['OWdle', totalOwdle],
      ['Deadlockle', totalDeadlockle],
      ['Distinct voters (in window)', distinctVoters],
    ].map(([k, v]) => '<div class="stat"><div class="label">' + k + '</div><div class="value">' + v + '</div></div>').join('');

    els.agg.innerHTML = agg.length === 0
      ? '<tr><td colspan="4" class="empty">No votes yet</td></tr>'
      : agg.map((r, i) => (
          '<tr>' +
            '<td class="num">' + (i + 1) + '</td>' +
            '<td class="game">' + escapeHtml(r.game_name) + (r.game_released ? '<small>' + escapeHtml(r.game_released) + '</small>' : '') + '</td>' +
            '<td class="num">' + r.votes + '</td>' +
            '<td class="num split"><span class="o">' + (r.votes_owdle ?? 0) + '</span> / <span class="d">' + (r.votes_deadlockle ?? 0) + '</span></td>' +
          '</tr>'
        )).join('');

    els.raw.innerHTML = raw.length === 0
      ? '<tr><td colspan="4" class="empty">No activity in this window</td></tr>'
      : raw.map((r) => (
          '<tr>' +
            '<td class="time" title="' + new Date(r.created_at * 1000).toISOString() + '">' + fmtTime(r.created_at) + '</td>' +
            '<td>' + pill(r.source) + '</td>' +
            '<td class="game">' + escapeHtml(r.game_name) + '</td>' +
            '<td class="hash" title="' + r.voter_hash + '">' + r.voter_hash.slice(0, 10) + '…</td>' +
          '</tr>'
        )).join('');

    els.meta.textContent = "Last refreshed " + new Date().toLocaleTimeString();
  } catch (e) {
    showError(String(e.message ?? e));
    els.meta.textContent = "";
  }
}

function escapeHtml(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({"&":"&amp;","<":"&lt;",">":"&gt;","\\"":"&quot;","'":"&#39;"}[c]));
}

els.refresh.addEventListener("click", load);
els.source.addEventListener("change", load);
els.since.addEventListener("change", load);
els.limit.addEventListener("change", load);
load();
</script>
</body>
</html>`;

const server = createServer(async (req, res) => {
  const url = req.url ?? "/";

  if (url === "/" || url.startsWith("/?")) {
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    res.end(HTML);
    return;
  }

  if (url.startsWith("/api/votes")) {
    const target = ORIGIN + url;
    try {
      const upstream = await fetch(target, {
        headers: { authorization: `Bearer ${SECRET}` },
      });
      const body = await upstream.text();
      res.writeHead(upstream.status, {
        "content-type":
          upstream.headers.get("content-type") ?? "application/json; charset=utf-8",
      });
      res.end(body);
    } catch (e) {
      res.writeHead(502, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: `upstream_failed: ${String(e)}` }));
    }
    return;
  }

  res.writeHead(404, { "content-type": "text/plain" });
  res.end("not found");
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`\nVotes admin viewer running:`);
  console.log(`  http://localhost:${PORT}`);
  console.log(`\n  proxying ${ORIGIN}/api/votes{,-raw}`);
  console.log(`  bound to 127.0.0.1 only · ctrl-c to stop\n`);
});
