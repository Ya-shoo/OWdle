#!/usr/bin/env node
// Local-only writer for data/sound-clip-trims.json. Runs alongside
// `next dev` so the DevSoundTrimmer on /sound can persist per-clip
// start/end overrides without us needing API routes (the app builds
// with output: "export", which rules out POST handlers).
//
// Usage:
//   npm run sound:trims
//     → listens on 127.0.0.1:8789
//
// Protocol:
//   POST /api/sound-trims
//   body: { heroKey: string, slug: string,
//           startOffset: number|null, endOffset: number|null }
//   - omits/strips null sides so we don't litter the file with no-op keys
//   - empties the slug entry when both sides clear → falls back to auto
//
// Bound to loopback so a malicious page on another origin can't quietly
// rewrite the manifest while you're editing.

import { createServer } from "node:http";
import { readFile, writeFile } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const TRIMS_FILE = resolve(__dirname, "..", "data", "sound-clip-trims.json");
const PORT = Number(process.env.SOUND_TRIMS_PORT ?? 8789);
const ORIGIN_ALLOWLIST = new Set([
  "http://localhost:3000",
  "http://127.0.0.1:3000",
  // next dev sometimes binds 3001+ when 3000 is taken; accept the next
  // couple of ports so a port-bumped session still saves without config.
  "http://localhost:3001",
  "http://127.0.0.1:3001",
  "http://localhost:3002",
  "http://127.0.0.1:3002",
]);

async function readTrims() {
  try {
    const raw = await readFile(TRIMS_FILE, "utf8");
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch (err) {
    if (err && err.code === "ENOENT") return {};
    throw err;
  }
}

async function writeTrims(trims) {
  // Stable two-space JSON with trailing newline so the file diffs cleanly
  // when committed and isn't constantly touched by editor-on-save.
  const text = JSON.stringify(trims, null, 2) + "\n";
  await writeFile(TRIMS_FILE, text, "utf8");
}

function applyEdit(trims, { heroKey, slug, startOffset, endOffset }) {
  const next = { ...trims };
  const heroEntry = { ...(next[heroKey] ?? {}) };
  const entry = {};
  if (typeof startOffset === "number" && isFinite(startOffset)) {
    entry.startOffset = Number(startOffset.toFixed(4));
  }
  if (typeof endOffset === "number" && isFinite(endOffset)) {
    entry.endOffset = Number(endOffset.toFixed(4));
  }
  if (Object.keys(entry).length === 0) {
    delete heroEntry[slug];
  } else {
    heroEntry[slug] = entry;
  }
  if (Object.keys(heroEntry).length === 0) {
    delete next[heroKey];
  } else {
    next[heroKey] = heroEntry;
  }
  return next;
}

function readBody(req) {
  return new Promise((resolveBody, rejectBody) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () =>
      resolveBody(Buffer.concat(chunks).toString("utf8")),
    );
    req.on("error", rejectBody);
  });
}

function corsHeaders(origin) {
  // Only echo back origins we explicitly trust. An unrecognized origin
  // still gets a CORS-less response, which the browser will refuse —
  // exactly what we want for a localhost-only tool.
  const allow = origin && ORIGIN_ALLOWLIST.has(origin) ? origin : "";
  return {
    "access-control-allow-origin": allow || "null",
    "access-control-allow-methods": "POST, OPTIONS",
    "access-control-allow-headers": "content-type",
    "access-control-max-age": "600",
    vary: "origin",
  };
}

const server = createServer(async (req, res) => {
  const origin = req.headers.origin ?? "";
  const headers = corsHeaders(origin);

  if (req.method === "OPTIONS") {
    res.writeHead(204, headers);
    res.end();
    return;
  }

  if (req.method !== "POST" || req.url !== "/api/sound-trims") {
    res.writeHead(404, { ...headers, "content-type": "text/plain" });
    res.end("not found");
    return;
  }

  try {
    const body = await readBody(req);
    const parsed = JSON.parse(body);
    if (!parsed || typeof parsed.heroKey !== "string" || !parsed.heroKey) {
      throw new Error("missing heroKey");
    }
    if (typeof parsed.slug !== "string" || !parsed.slug) {
      throw new Error("missing slug");
    }
    const trims = await readTrims();
    const next = applyEdit(trims, {
      heroKey: parsed.heroKey,
      slug: parsed.slug,
      startOffset: parsed.startOffset,
      endOffset: parsed.endOffset,
    });
    await writeTrims(next);
    res.writeHead(200, { ...headers, "content-type": "application/json" });
    res.end(JSON.stringify({ ok: true }));
    console.log(
      `[${new Date().toISOString()}] ${parsed.heroKey}/${parsed.slug} → ` +
        `start=${parsed.startOffset ?? "—"} end=${parsed.endOffset ?? "—"}`,
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    res.writeHead(400, { ...headers, "content-type": "text/plain" });
    res.end(`bad request: ${msg}`);
  }
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`sound-trims server → http://127.0.0.1:${PORT}/api/sound-trims`);
  console.log(`writing to ${TRIMS_FILE}`);
});
