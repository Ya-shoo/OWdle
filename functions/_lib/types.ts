// Minimal types for Cloudflare Pages Functions in this project.
// We declare them locally so we don't depend on @cloudflare/workers-types.
// Only the surface we actually use is modelled.

export interface D1Statement {
  bind(...values: unknown[]): D1Statement;
  run(): Promise<{ success: boolean; meta: unknown }>;
  first<T = unknown>(col?: string): Promise<T | null>;
  all<T = unknown>(): Promise<{ results: T[]; success: boolean }>;
}

export interface D1 {
  prepare(query: string): D1Statement;
}

export type Env = {
  DB: D1;
  RAWG_API_KEY: string;
  ADMIN_SECRET?: string;
  // Discord webhook URL the feedback endpoint pings after a successful
  // insert. Optional: when unset the endpoint just writes to D1 and
  // returns, so dev/local deploys keep working without leaking secrets.
  FEEDBACK_WEBHOOK_URL?: string;
  // PostHog personal API key + project id for the `stats/today` endpoint.
  // Optional: when unset the stats endpoint serves an empty payload so
  // local Pages dev (and unconfigured preview deploys) keep working.
  POSTHOG_PERSONAL_API_KEY?: string;
  POSTHOG_PROJECT_ID?: string;
  // Public project API token (phc_…) used in PostHog UI URLs. The
  // numeric project ID works for the API but PostHog's frontend routes
  // by token. Defaults to the DailyDles project token in feedback.ts.
  POSTHOG_PROJECT_TOKEN?: string;
  // Optional override; defaults to https://us.posthog.com. EU instances
  // would set this to https://eu.posthog.com.
  POSTHOG_API_HOST?: string;
};

export type Context = {
  request: Request;
  env: Env;
  waitUntil(p: Promise<unknown>): void;
};

export type Handler = (context: Context) => Response | Promise<Response>;

// sha256 helper used for the voter hash. We salt with project + a 2-day
// epoch bucket so the hash rotates every 2 days — privacy-preserving
// per-IP dedup that lets a voter recast on the same game every other day.
// Including `project` keeps OWdle and Deadlockle dedup independent, so a
// voter can cast at most one vote per (game, site) per 2-day window.
const TWO_DAYS_MS = 2 * 86400 * 1000;
export async function voterHash(ip: string, project: string): Promise<string> {
  const bucket = Math.floor(Date.now() / TWO_DAYS_MS);
  const buf = new TextEncoder().encode(`${ip}:${project}:${bucket}`);
  const out = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(out))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// Constant-time string comparison. Used for secret/token checks where a
// non-CT compare leaks tiny timing info that could in theory be used to
// guess a secret byte-by-byte. On Cloudflare's edge runtime network jitter
// dominates, so this is defence-in-depth rather than a hot fix.
export function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}
