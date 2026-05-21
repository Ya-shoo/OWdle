#!/usr/bin/env node
// Local-only admin viewer for the shared feedback table. Mirrors the
// votes-admin-server.mjs pattern: reads ADMIN_SECRET from .env.secrets,
// proxies to playowdle.com's /api/feedback-raw with the Bearer header
// server-side, and serves a single HTML page bound to 127.0.0.1.
//
// Usage:
//   npm run feedback:admin
//     → http://localhost:8789

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
const ORIGIN = process.env.FEEDBACK_ADMIN_ORIGIN ?? "https://playowdle.com";
const PORT = Number(process.env.FEEDBACK_ADMIN_PORT ?? 8789);

const HTML = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>Feedback admin · OWdle + Deadlockle</title>
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
  .controls select, .controls input[type="text"], .controls button {
    background: var(--panel);
    color: var(--text);
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 8px 12px;
    font: inherit;
  }
  .controls input[type="text"] { min-width: 240px; }
  .controls input[type="text"]::placeholder { color: var(--muted); }
  .controls button { cursor: pointer; }
  .controls button:hover { border-color: var(--accent); }
  .controls label { display: inline-flex; align-items: center; gap: 6px; color: var(--muted); font-size: 12px; text-transform: uppercase; letter-spacing: 0.06em; }
  .controls .meta { color: var(--muted); margin-left: auto; font-size: 12px; }
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
  table { width: 100%; border-collapse: collapse; table-layout: fixed; }
  th, td {
    text-align: left;
    padding: 10px 16px;
    border-bottom: 1px solid var(--border);
    font-size: 13px;
    vertical-align: top;
  }
  th {
    color: var(--muted);
    font-weight: 500;
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.06em;
  }
  th.col-when { width: 110px; }
  th.col-source { width: 110px; }
  th.col-hash { width: 120px; }
  tr:last-child td { border-bottom: none; }
  td.body { white-space: pre-wrap; word-wrap: break-word; line-height: 1.45; }
  td.body mark { background: rgba(255,138,60,0.32); color: var(--text); padding: 0 2px; border-radius: 2px; }
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
  .empty { padding: 24px 16px; color: var(--muted); text-align: center; }
  .err { background: #2a1115; border: 1px solid #642228; color: #ffb1b1; padding: 12px 16px; border-radius: 8px; margin-bottom: 16px; }
</style>
</head>
<body>
  <h1>Feedback admin</h1>
  <div class="sub">Shared <code>owdle-votes</code> D1 · <code>feedback</code> table · proxied through localhost so your secret stays on disk</div>

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
    <input id="q" type="text" placeholder="filter by keywords (space = AND)" autocomplete="off" />
    <button id="refresh">Refresh</button>
    <span class="meta" id="meta"></span>
  </div>

  <div id="error" class="err" hidden></div>

  <div class="card">
    <h2>Feedback submissions</h2>
    <table id="rows">
      <thead><tr><th class="col-when">When</th><th class="col-source">Source</th><th>Body</th><th class="col-hash">Submitter</th></tr></thead>
      <tbody></tbody>
    </table>
  </div>

<script>
const $ = (sel) => document.querySelector(sel);
const els = {
  totals: $("#totals"),
  source: $("#source"),
  since: $("#since"),
  limit: $("#limit"),
  q: $("#q"),
  refresh: $("#refresh"),
  meta: $("#meta"),
  error: $("#error"),
  rows: $("#rows tbody"),
};

// Last-fetched rows kept in memory so keystroke filtering doesn't refetch.
let lastFetched = [];

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
  const cls = source === "owdle" || source === "deadlockle" ? source : "";
  return '<span class="pill ' + cls + '">' + escapeHtml(source) + '</span>';
}

function escapeHtml(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({"&":"&amp;","<":"&lt;",">":"&gt;","\\"":"&quot;","'":"&#39;"}[c]));
}

function highlight(body, tokens) {
  const safe = escapeHtml(body);
  if (tokens.length === 0) return safe;
  // Build one regex with all tokens (alternation) so we mark every hit
  // in one pass. Tokens are escaped for regex safety.
  const escaped = tokens
    .map((t) => t.replace(/[.*+?^\${}()|[\\]\\\\]/g, "\\\\$&"))
    .filter(Boolean);
  if (escaped.length === 0) return safe;
  const re = new RegExp("(" + escaped.join("|") + ")", "gi");
  return safe.replace(re, "<mark>$1</mark>");
}

function tokenize(q) {
  return q.trim().toLowerCase().split(/\\s+/).filter(Boolean);
}

function applyFilter() {
  const tokens = tokenize(els.q.value);
  const filtered = tokens.length === 0
    ? lastFetched
    : lastFetched.filter((r) => {
        const body = String(r.body ?? "").toLowerCase();
        return tokens.every((t) => body.includes(t));
      });

  // Per-source counts based on the *currently visible* rows so the
  // headline stats track the active filter.
  const total = filtered.length;
  const totalOwdle = filtered.filter((r) => r.source === "owdle").length;
  const totalDeadlockle = filtered.filter((r) => r.source === "deadlockle").length;
  const distinctSubmitters = new Set(filtered.map((r) => r.submitter_hash)).size;

  els.totals.innerHTML = [
    ["Submissions (showing)", total],
    ["OWdle", totalOwdle],
    ["Deadlockle", totalDeadlockle],
    ["Distinct submitters", distinctSubmitters],
  ].map(([k, v]) => '<div class="stat"><div class="label">' + k + '</div><div class="value">' + v + '</div></div>').join('');

  els.rows.innerHTML = filtered.length === 0
    ? '<tr><td colspan="4" class="empty">' + (lastFetched.length === 0 ? "No feedback yet in this window" : "No matches for filter") + '</td></tr>'
    : filtered.map((r) => (
        '<tr>' +
          '<td class="time" title="' + new Date(r.created_at * 1000).toISOString() + '">' + fmtTime(r.created_at) + '</td>' +
          '<td>' + pill(r.source) + '</td>' +
          '<td class="body">' + highlight(String(r.body ?? ""), tokens) + '</td>' +
          '<td class="hash" title="' + escapeHtml(r.submitter_hash) + '">' + escapeHtml((r.submitter_hash ?? "").slice(0, 10)) + '…</td>' +
        '</tr>'
      )).join('');

  const fetchedNote = "fetched " + lastFetched.length;
  const filterNote = tokens.length > 0 ? " · filter: " + tokens.length + " token" + (tokens.length === 1 ? "" : "s") : "";
  els.meta.textContent = fetchedNote + filterNote;
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

  const qs = new URLSearchParams({ limit: String(limit), since: String(sinceUnix) });
  if (source) qs.set("source", source);

  els.meta.textContent = "Loading…";
  try {
    const resp = await fetch("/api/feedback-raw?" + qs);
    if (!resp.ok) throw new Error("feedback-raw: " + resp.status + " " + await resp.text());
    const data = await resp.json();
    lastFetched = data.results ?? [];
    applyFilter();
  } catch (e) {
    showError(String(e.message ?? e));
    els.meta.textContent = "";
  }
}

els.refresh.addEventListener("click", load);
els.source.addEventListener("change", load);
els.since.addEventListener("change", load);
els.limit.addEventListener("change", load);
els.q.addEventListener("input", applyFilter);
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

  if (url.startsWith("/api/feedback-raw")) {
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
  console.log(`\nFeedback admin viewer running:`);
  console.log(`  http://localhost:${PORT}`);
  console.log(`\n  proxying ${ORIGIN}/api/feedback-raw`);
  console.log(`  bound to 127.0.0.1 only · ctrl-c to stop\n`);
});
