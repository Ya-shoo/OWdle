// Standalone writeback server for /labeler/map/edit. Sidesteps the
// `output: "export"` Next.js config that bans API routes — the edit
// page POSTs here, this script writes the canonical data/spots.json.
//
// Run alongside `next dev`:
//
//   Terminal 1:  npm run dev
//   Terminal 2:  npm run spots-server
//
// Listens on http://localhost:3030/spots by default. Write atomically
// via temp-file-then-rename so a crashed save can't half-write the
// canonical file.

import http from "node:http";
import { readFile, writeFile, rename } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..");
const SPOTS_PATH = path.join(REPO_ROOT, "data", "spots.json");

const PORT = Number(process.env.SPOTS_PORT ?? 3030);
const ALLOWED_ORIGINS = new Set([
  "http://localhost:3000",
  "http://localhost:3001",
  "http://127.0.0.1:3000",
  "http://127.0.0.1:3001",
]);

function applyCors(req, res) {
  const origin = req.headers.origin;
  if (origin && ALLOWED_ORIGINS.has(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
  }
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return Buffer.concat(chunks).toString("utf-8");
}

function isSpot(v, mapKey) {
  if (!v || typeof v !== "object") return false;
  return (
    typeof v.id === "string" &&
    v.mapKey === mapKey &&
    typeof v.worldX === "number" &&
    typeof v.worldY === "number" &&
    typeof v.worldZ === "number" &&
    typeof v.pixelX === "number" &&
    typeof v.pixelY === "number" &&
    typeof v.screenshot === "string"
  );
}

function json(res, status, body) {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
}

const server = http.createServer(async (req, res) => {
  applyCors(req, res);

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  if (req.method !== "POST" || req.url?.split("?")[0] !== "/spots") {
    json(res, 404, { error: "Not found" });
    return;
  }

  let body;
  try {
    const raw = await readBody(req);
    body = JSON.parse(raw);
  } catch {
    json(res, 400, { error: "Invalid JSON body." });
    return;
  }

  if (!body || typeof body !== "object" || !("spots" in body)) {
    json(res, 400, { error: "Expected { spots: { [mapKey]: MapSpot[] } }." });
    return;
  }
  const patch = body.spots;
  if (!patch || typeof patch !== "object" || Array.isArray(patch)) {
    json(res, 400, { error: "`spots` must be an object keyed by mapKey." });
    return;
  }

  // Validate every spot in every patched map before touching the file.
  // A partial accept would leave the canonical file with some maps
  // updated and the bad ones rejected — worse than refusing the whole
  // write.
  for (const [mapKey, list] of Object.entries(patch)) {
    if (!Array.isArray(list)) {
      json(res, 400, { error: `spots[${mapKey}] is not an array.` });
      return;
    }
    for (let i = 0; i < list.length; i++) {
      if (!isSpot(list[i], mapKey)) {
        const id =
          list[i] && typeof list[i] === "object" && "id" in list[i]
            ? String(list[i].id)
            : "no-id";
        json(res, 400, {
          error: `spots[${mapKey}][${i}] (${id}) failed shape check.`,
        });
        return;
      }
    }
  }

  try {
    const raw = await readFile(SPOTS_PATH, "utf-8");
    const existing = JSON.parse(raw);
    for (const [mapKey, list] of Object.entries(patch)) {
      existing[mapKey] = list;
    }
    const tmp = SPOTS_PATH + ".tmp";
    await writeFile(tmp, JSON.stringify(existing, null, 2), "utf-8");
    await rename(tmp, SPOTS_PATH);
    const counts = Object.fromEntries(
      Object.entries(patch).map(([k, v]) => [k, v.length]),
    );
    json(res, 200, { ok: true, updated: counts });
  } catch (e) {
    json(res, 500, { error: e instanceof Error ? e.message : String(e) });
  }
});

server.listen(PORT, () => {
  console.log(`spots-server listening on http://localhost:${PORT}/spots`);
  console.log(`writes -> ${SPOTS_PATH}`);
  console.log(`(Run \`npm run dev\` separately for the Next.js app.)`);
});
