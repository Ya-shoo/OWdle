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
};

export type Context = {
  request: Request;
  env: Env;
  waitUntil(p: Promise<unknown>): void;
};

export type Handler = (context: Context) => Response | Promise<Response>;

// sha256 helper used for the voter hash. We salt with project + month
// so the hash naturally rotates each month — gives us privacy-preserving
// per-IP dedup that doesn't lock a voter out forever.
export async function voterHash(ip: string, project: string): Promise<string> {
  const month = new Date().toISOString().slice(0, 7); // "2026-05"
  const buf = new TextEncoder().encode(`${ip}:${project}:${month}`);
  const out = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(out))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
