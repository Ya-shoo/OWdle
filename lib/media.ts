// Resolves a media URL to its serving origin.
//
// In production the heavy assets (hero ability audio + video, map
// overheads, captured spot screenshots) live in Cloudflare R2 and are
// served via a CDN-backed custom domain (configured per-deploy in
// NEXT_PUBLIC_MEDIA_BASE). In local dev the env var is unset and the
// helper falls through to the relative path — Next.js then serves
// straight from the local `public/` directory, same as before R2.
//
// Data files in `data/*.json` keep relative paths (e.g.
// `/sounds/ana/biotic-grenade.mp3`). The helper is applied at render
// time at each `<img>` / `<audio>` / `<video>` boundary, so:
//
//   • the on-disk JSON stays portable (no hard-coded R2 hostname)
//   • exports from labeler tools don't accidentally bake an R2 URL
//   • flipping between local files and R2 is a single env-var change

// Production fallback. The repo deploys to Cloudflare Pages with media
// served from an R2 bucket at media.playowdle.com — if no explicit
// NEXT_PUBLIC_MEDIA_BASE is set at build time, production builds still
// resolve to the canonical R2 origin. Dev builds keep falling through
// to relative paths (served from `public/` by next-dev).
const PROD_DEFAULT = "https://media.playowdle.com";

function resolveBase(): string {
  if (typeof process === "undefined") return "";
  const explicit = process.env.NEXT_PUBLIC_MEDIA_BASE;
  if (explicit) return explicit;
  if (process.env.NODE_ENV === "production") return PROD_DEFAULT;
  return "";
}

const MEDIA_BASE = resolveBase();

const TRIMMED_BASE = MEDIA_BASE.endsWith("/")
  ? MEDIA_BASE.slice(0, -1)
  : MEDIA_BASE;

// Only paths inside these directories live in R2 and need to be
// rewritten to MEDIA_BASE. Everything else under public/ (splash,
// portraits, abilities, sfx, kofi-avatar.jpg, etc.) ships with the
// Cloudflare Pages deploy and is served from the same origin as the
// site. Keep this list in lockstep with scripts/sync-to-r2.mjs's
// SYNC_DIRS — they're the canonical source of "what's in R2."
//
// Without this gate, paths like /splash/tracer.jpg get rewritten to
// https://media.playowdle.com/splash/tracer.jpg and 404 in production,
// silently breaking Spotlight mode (and any other Pages-served asset
// that happened to be wrapped in media()).
const R2_PREFIXES = [
  "/sounds/",
  "/melee/",
  "/maps/",
  "/skins/",
  "/voicelines/",
  "/banners/",
] as const;

export function media(path: string | null | undefined): string {
  if (!path) return "";
  // Pass through anything that already has a scheme. http(s) for
  // external assets, blob: for File-drop object URLs (calibrate /
  // labeler workflows), data: for inline payloads.
  if (
    /^https?:\/\//i.test(path) ||
    path.startsWith("blob:") ||
    path.startsWith("data:")
  ) {
    return path;
  }
  // No base configured — serve from same origin (local dev / pre-R2).
  if (!TRIMMED_BASE) return path;
  // Pages-served paths bypass the R2 rewrite. Anything else (i.e.
  // /sounds/, /maps/, /skins/, /voicelines/, /banners/) gets the
  // MEDIA_BASE prefix so it resolves to R2.
  const isR2 = R2_PREFIXES.some((p) => path.startsWith(p));
  if (!isR2) return path;
  const sep = path.startsWith("/") ? "" : "/";
  return TRIMMED_BASE + sep + path;
}

// Whether the env var is set — useful for "Active media: R2" badges in
// dev tools so we can tell at a glance whether assets are local or
// remote.
export const MEDIA_IS_REMOTE = TRIMMED_BASE !== "";
export const MEDIA_BASE_RAW = TRIMMED_BASE;
