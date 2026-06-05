// Dev OG-image server — runs the Cloudflare Pages Functions (the
// /og/r/[code] share-card renderer + /r/[code] meta shell) locally via
// `wrangler pages dev` on :8799 so the share modal's unfurl preview
// works inside `npm run dev`. In production those routes are served by
// Pages itself; `next dev` alone has no functions runtime, which is why
// the preview showed its fallback state without this.
//
// lib/shareLinks.ts points ogImageUrl at http://localhost:8799 when
// NODE_ENV === "development" — keep the port here and there in sync.
//
// Per the dev-hub rule (AGENTS.md): this must survive its resources
// being missing. wrangler serves functions/ from source, but it
// requires an assets directory to exist — a fresh clone may not have
// built ./out yet, so we create it empty (functions still work; static
// assets 404, which nothing in the preview flow needs). If wrangler
// itself fails to boot, log and idle instead of exiting non-zero, so
// concurrently's --kill-others-on-fail doesn't tear down the rest of
// the dev stack.

import { mkdirSync } from "node:fs";
import { spawn } from "node:child_process";

const PORT = 8799;

mkdirSync("out", { recursive: true });

const child = spawn(
  "npx",
  ["wrangler", "pages", "dev", "out", "--port", String(PORT)],
  { stdio: "inherit", shell: process.platform === "win32" },
);

child.on("error", (err) => {
  console.log(
    `[og] wrangler failed to start (${err.message}) — share-preview OG images offline; everything else works.`,
  );
});

child.on("exit", (code) => {
  console.log(
    `[og] wrangler exited (code ${code}) — share-preview OG images offline; everything else works.`,
  );
  // Exit cleanly so --kill-others-on-fail leaves the rest of the dev
  // stack running.
  process.exit(0);
});
