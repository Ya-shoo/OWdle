#!/usr/bin/env node
// Local-only reader/writer for data/hero-palettes.json. Runs alongside
// `next dev` so the palette editor on /labeler/share-preview/ can
// persist hero costume palettes without API routes (the app builds with
// output: "export", which rules out POST handlers).
//
// Usage:
//   node scripts/palette-server.mjs
//     → listens on 127.0.0.1:8791
//
// Protocol:
//   GET  /api/hero-palettes
//     → the full palettes map (live file contents)
//   POST /api/hero-palettes
//     body: { key: string, colors: string[] }
//     - colors must be 1-5 "#rrggbb" values; empty array deletes the key
//     - file is rewritten sorted + pretty-printed so it diffs cleanly
//
// Bound to loopback so a malicious page on another origin can't quietly
// rewrite the palettes while you're editing.

import { createServer } from "node:http";
import { readFile, writeFile } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PALETTES_FILE = resolve(__dirname, "..", "data", "hero-palettes.json");
const PORT = Number(process.env.HERO_PALETTES_PORT ?? 8791);
const HEX_RE = /^#[0-9a-f]{6}$/i;
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

async function readPalettes() {
  try {
    const raw = await readFile(PALETTES_FILE, "utf8");
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch (err) {
    if (err && err.code === "ENOENT") return {};
    throw err;
  }
}

async function writePalettes(palettes) {
  // Sorted keys + stable two-space JSON with trailing newline so the
  // file diffs cleanly when committed.
  const sorted = Object.fromEntries(
    Object.keys(palettes)
      .sort()
      .map((k) => [k, palettes[k]]),
  );
  const text = JSON.stringify(sorted, null, 2) + "\n";
  await writeFile(PALETTES_FILE, text, "utf8");
}

function readBody(req) {
  return new Promise((resolveBody, rejectBody) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => resolveBody(Buffer.concat(chunks).toString("utf8")));
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
    "access-control-allow-methods": "GET, POST, OPTIONS",
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

  if (req.url !== "/api/hero-palettes") {
    res.writeHead(404, { ...headers, "content-type": "text/plain" });
    res.end("not found");
    return;
  }

  if (req.method === "GET") {
    try {
      const palettes = await readPalettes();
      res.writeHead(200, { ...headers, "content-type": "application/json" });
      res.end(JSON.stringify(palettes));
    } catch (err) {
      res.writeHead(500, { ...headers, "content-type": "text/plain" });
      res.end(String(err));
    }
    return;
  }

  if (req.method !== "POST") {
    res.writeHead(405, { ...headers, "content-type": "text/plain" });
    res.end("method not allowed");
    return;
  }

  try {
    const body = await readBody(req);
    const parsed = JSON.parse(body);
    if (!parsed || typeof parsed.key !== "string" || !parsed.key) {
      throw new Error("missing key");
    }
    if (!Array.isArray(parsed.colors) || parsed.colors.length > 5) {
      throw new Error("colors must be an array of 0-5 entries");
    }
    for (const c of parsed.colors) {
      if (typeof c !== "string" || !HEX_RE.test(c)) {
        throw new Error(`invalid color ${JSON.stringify(c)}`);
      }
    }
    const palettes = await readPalettes();
    if (parsed.colors.length === 0) {
      delete palettes[parsed.key];
    } else {
      palettes[parsed.key] = parsed.colors.map((c) => c.toLowerCase());
    }
    await writePalettes(palettes);
    res.writeHead(200, { ...headers, "content-type": "application/json" });
    res.end(JSON.stringify({ ok: true }));
    console.log(
      `[${new Date().toISOString()}] ${parsed.key} → ${
        parsed.colors.join(" ") || "(removed)"
      }`,
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    res.writeHead(400, { ...headers, "content-type": "text/plain" });
    res.end(`bad request: ${msg}`);
  }
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`palette server → http://127.0.0.1:${PORT}/api/hero-palettes`);
  console.log(`writing to ${PALETTES_FILE}`);
});
