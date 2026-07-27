// Analytics guardrails for the production deploy path.
//
// Why this exists:
//   A production build that ships WITHOUT NEXT_PUBLIC_POSTHOG_KEY silently
//   disables ALL browser analytics. instrumentation-client.ts only calls
//   posthog.init() inside `if (key && !key.startsWith("phc_REPLACE"))`, so a
//   missing/placeholder key dead-code-eliminates init — no error, no events,
//   game still works. This exact footgun took OWdle analytics dark for ~22h
//   on 2026-07-21: the key lives in the gitignored .env.local, and a build
//   produced in any context that lacks that file omits the key.
//
// Two gates, both called from scripts/build-for-deploy.mjs:
//   assertPosthogEnv   — pre-build, fail fast if the env has no real key
//   assertPosthogBaked — post-build, verify the key is actually in out/
//
// Shared machinery: keep in lockstep with ../Deadlockle and ../WuWadle.

import { readdir, readFile, access } from "node:fs/promises";
import { join } from "node:path";
// @next/env is CommonJS — import the default and destructure (its named
// exports aren't statically detectable for ESM `import { }`).
import nextEnv from "@next/env";
const { loadEnvConfig } = nextEnv;

// Must match the sentinel instrumentation-client.ts guards against.
const POSTHOG_PLACEHOLDER = "phc_REPLACE";
// Production must route events through the /ingest reverse proxy so
// ad-blockers can't drop them (see functions/ingest/[[path]].ts).
const EXPECTED_HOST = "/ingest";

async function exists(p) {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
}

// Gate 1 (pre-build): resolve env exactly the way `next build` does
// (.env, .env.production, .env.local, .env.production.local — dev-only
// files are excluded) and refuse to build without a real key.
export function assertPosthogEnv(projectDir) {
  loadEnvConfig(projectDir, /* dev */ false); // production env precedence
  const key = process.env.NEXT_PUBLIC_POSTHOG_KEY;
  if (!key || key.startsWith(POSTHOG_PLACEHOLDER)) {
    throw new Error(
      "[analytics-guard] NEXT_PUBLIC_POSTHOG_KEY is missing or a placeholder.\n" +
        "  A deploy built like this ships with browser analytics DISABLED —\n" +
        "  posthog.init() is skipped when the key is empty (silent, no error).\n" +
        "  Fix: set NEXT_PUBLIC_POSTHOG_KEY in .env.local. That file is\n" +
        "  gitignored, so it does NOT travel with the repo — THIS machine needs\n" +
        "  its own copy. Get the phc_ key from https://us.posthog.com →\n" +
        "  Project settings → API key.",
    );
  }
  const host = process.env.NEXT_PUBLIC_POSTHOG_HOST;
  if (host && host !== EXPECTED_HOST) {
    // Soft warning: a non-/ingest host in a prod build usually means a dev
    // override (.env.development.local) leaked in. Events still fire but
    // ad-blockers drop ~20-30% of them.
    console.warn(
      `[analytics-guard] WARNING — NEXT_PUBLIC_POSTHOG_HOST="${host}" is not ` +
        `"${EXPECTED_HOST}"; production events should route through the reverse ` +
        `proxy or ad-blockers will drop a large share of them.`,
    );
  }
  console.log("[analytics-guard] NEXT_PUBLIC_POSTHOG_KEY present ✓");
  return key;
}

// Gate 2 (post-build): the shipped artifact is the source of truth. Confirm
// the public phc_ key literal actually landed in the built JS — catches any
// reason (env not loaded, bundler quirk, tree-shaking) the key didn't reach
// the bundle, not just a missing env var.
export async function assertPosthogBaked(projectDir) {
  const key = process.env.NEXT_PUBLIC_POSTHOG_KEY;
  if (!key || key.startsWith(POSTHOG_PLACEHOLDER)) {
    // Should never happen if assertPosthogEnv ran first, but be explicit.
    throw new Error(
      "[analytics-guard] no real PostHog key in env at bake-check time — " +
        "call assertPosthogEnv() before building.",
    );
  }
  const staticDir = join(projectDir, "out", "_next", "static");
  if (!(await exists(staticDir))) {
    throw new Error(
      `[analytics-guard] ${staticDir} not found — the static export did not ` +
        `produce out/, cannot verify analytics.`,
    );
  }

  async function containsKey(dir) {
    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const p = join(dir, entry.name);
      if (entry.isDirectory()) {
        if (await containsKey(p)) return true;
      } else if (entry.name.endsWith(".js")) {
        if ((await readFile(p, "utf8")).includes(key)) return true;
      }
    }
    return false;
  }

  if (!(await containsKey(staticDir))) {
    throw new Error(
      "[analytics-guard] the PostHog key is NOT present in any built JS chunk " +
        "under out/_next/static — this deploy would be analytics-dark. " +
        "Aborting before upload.",
    );
  }
  console.log("[analytics-guard] PostHog key baked into built bundle ✓");
}
