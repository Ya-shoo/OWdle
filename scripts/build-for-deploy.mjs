// Production build wrapper that keeps Cloudflare R2-hosted media OUT
// of the Pages deploy output.
//
// Why this exists:
//   Next.js copies the entire `public/` directory into `out/`. Our
//   `public/sounds/` and `public/maps/` are dev/labeling working state
//   that lives in R2 in production (see lib/media.ts). Letting Next.js
//   include them in `out/` would:
//     1. inflate the deploy from ~10 MB to ~800 MB
//     2. trip Cloudflare Pages' 25 MB-per-file ceiling (oasis.webp is 27 MB)
//   Both of which break or bloat the deploy for no benefit — the
//   game-side code references media via media.playowdle.com.
//
// Strategy:
//   1. Move public/sounds and public/maps to a staging dir
//   2. Run `next build`
//   3. Always move them back (try/finally) — even on build failure
//
// Used by `npm run build:deploy` (which `deploy:live` chains through).

import { rename, mkdir, access } from "node:fs/promises";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, "..");
const STAGE_ROOT = join(REPO_ROOT, ".staged-media");
const STAGED = ["sounds", "maps"];

async function exists(p) {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
}

async function stash() {
  await mkdir(STAGE_ROOT, { recursive: true });
  const moved = [];
  for (const name of STAGED) {
    const src = join(REPO_ROOT, "public", name);
    const dst = join(STAGE_ROOT, name);
    if (await exists(src)) {
      await rename(src, dst);
      moved.push(name);
      console.log(`[stash] public/${name} → .staged-media/${name}`);
    }
  }
  return moved;
}

async function restore(moved) {
  for (const name of moved) {
    const src = join(STAGE_ROOT, name);
    const dst = join(REPO_ROOT, "public", name);
    if (await exists(src)) {
      // If something already exists at dst (e.g. a partial restore from
      // a previous failed run), the rename will fail on Windows. We
      // accept that and bail — the user can fix manually.
      await rename(src, dst);
      console.log(`[restore] .staged-media/${name} → public/${name}`);
    }
  }
}

function runBuild() {
  return new Promise((res, rej) => {
    // shell: true lets Windows resolve npm/npx via PATHEXT — without
    // it Node.js fails with EINVAL when handed a .cmd / .bat shim.
    const proc = spawn("npx next build", {
      cwd: REPO_ROOT,
      stdio: "inherit",
      shell: true,
    });
    proc.on("exit", (code) => {
      if (code === 0) res();
      else rej(new Error(`next build exited with code ${code}`));
    });
    proc.on("error", rej);
  });
}

let moved = [];
try {
  moved = await stash();
  await runBuild();
} catch (e) {
  console.error("\n[build-for-deploy] build failed:", e.message ?? e);
  process.exitCode = 1;
} finally {
  try {
    await restore(moved);
  } catch (e) {
    console.error(
      "[build-for-deploy] WARNING — failed to restore staged media:",
      e.message ?? e,
    );
    console.error(
      "  Manually move files in .staged-media/ back into public/ before next dev session.",
    );
  }
}
