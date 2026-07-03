<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# OWdle — daily Overwatch guessing game (playowdle.com)

One daily hero, guessed across several modes. **Next.js 16.2.4 / React 19**, static export (`output: "export"` → `out/`) deployed to **Cloudflare Pages**; dynamic bits are **Pages Functions** (`functions/`). Shared infra with the sibling sites: R2 bucket `dailydles`, D1 `owdle-votes`, one PostHog project.

Sibling repos (same architecture — keep shared machinery in lockstep): `../Deadlockle`, `../WuWadle`. **For anything cross-site — the shared engine model, the R2/D1/PostHog conventions, or procedures like "add a mode" / "update media" / "deploy" — use the `dailydles` skill.**

## Where things live
- `app/` — App Router routes. One dir per mode (`/classic`, `/quote`, `/splash`, `/sound`, `/ability`, `/map`) plus `/how-to-play`, `/privacy`. Dev-only tools under `app/labeler/**` (404 in prod).
- `components/` — ~70 components: the per-mode `*Game.tsx` engines, share stack (`ShareButton`/`ShareModal`/`ShareCard`), nav/CTA, streak & rank badges, greeter, `Map*` labeler UIs.
- `lib/` — the game engine (see next section).
- `data/` — committed JSON that drives content (`heroes.json`, `skins.json`, `quote-conversations.json`, `sound-clips.json`, `spots.json`/`maps.json`/`map-calibrations.json`, `gamemodes.json`, …). **Relative media paths only — never bake the R2 host into data.**
- `db/` — D1 schema + migrations (`owdle-votes`; tables `votes`, `feedback`, `poll_votes`, `pending_replay_links`).
- `functions/` — Cloudflare Pages Functions: `og/r/[code].tsx` (OG card render → R2 cache), `r/[code].ts` (unfurl shell), `ingest/[[path]].ts` (PostHog proxy), `api/*` (vote, feedback, greeter, stats, …).
- `scripts/` — build/asset pipeline + dev helper servers (see `docs/dev-hub.md`).
- `workers/replay-verifier/` — standalone Worker attaching PostHog replay links to Discord feedback (serves both sites).
- `public/` — Pages-served static assets. Heavy dirs (`sounds/ maps/ skins/ voicelines/ banners/`) live in R2, gitignored (see `docs/media-and-r2.md`).

## The engine — how a "mode" works
A mode is a row in `MODES` (`lib/modes.ts`), typed `ModeDef {slug,label,blurb,built}`; `built:false` hides it from the grid/sitemap. `BUILT_MODE_SLUGS` is the canonical play order and the source of truth for share-code slot order. Each mode has a thin server route `app/<slug>/page.tsx` (sets `modeMetadata`/`modeJsonLd`, renders `<XGame/>`); the client engine is `components/XGame.tsx`. It derives the **date-seeded** daily answer via `get<Mode>ForDay(dayString())` in `lib/daily.ts` (FNV-1a of `owdle:<mode>:<day>` into a pool, or the shuffle-bag in `lib/dailyBag.ts` after `BAG_CUTOVER_DAY`), hydrates/persists `ModeState` via `lib/storage.ts` (key `owdle.<mode>.<day>`), fires events via `lib/tracking.ts`, and on a terminal state builds share links (`lib/shareLinks.ts`) + calls `bumpStreakIfNeeded` (`lib/streak.ts`). The day is "complete" when every `BUILT_MODE_SLUGS` mode is won/lost → drives streak, the daily share code, and rank tier (`lib/streakRank.ts`). Day rolls **2:15am America/Los_Angeles**.

Key engine files: `lib/modes.ts` · `lib/daily.ts` + `lib/dailyBag.ts` · `lib/storage.ts` · `lib/heroes.ts` (roster + `ANSWER_POOL`) · `lib/compare.ts` (Classic attribute tiles) · `lib/shareUrl.ts` (code codec, Functions-safe) · `lib/media.ts`. Scoring is **map-mode only** (`lib/scoring.ts`); other modes are won/lost + guess count.

## Modes
| mode | route | component | status |
|---|---|---|---|
| classic | `/classic` | `ClassicGame.tsx` | shipped |
| quote | `/quote` | `QuoteGame.tsx` | shipped |
| splash ("Spotlight") | `/splash` | `SplashGame.tsx` | shipped |
| sound | `/sound` | `SoundGame.tsx` | shipped |
| ability | `/ability` | `AbilityGame.tsx` | shipped |
| map | `/map` | `MapGame.tsx` | **WIP** (`built:false`, unlisted; much of it untracked — see `docs/dev-hub.md`) |

## Commands
- `npm run dev` — full stack via `concurrently`: `next dev` (:3000) + helper servers (votes :8788, feedback :8790, sound-trims :8789, palette :8791, og :8799). `npm run dev:next` = Next alone.
- `npm run build` / `npm run build:deploy` — `build:deploy` (`scripts/build-for-deploy.mjs`) stages R2 media out of the Pages upload.
- `npm run deploy:live` — `sync-to-r2 → build:deploy → wrangler pages deploy --branch=main → git push`. ("deploy" = deploy + commit + push; confirm with Yash first.)
- `npm run sync-to-r2` — upload media to R2 (HEAD-diff, 8× concurrency). `sync-clips` = PC-only Sound clip ingest. `deploy:verifier` = deploy the replay-verifier Worker.

## Deep dives — read only when working in these areas
- Media / R2 pipeline + Mac↔PC dev setup → `docs/media-and-r2.md`
- Share cards & the OG renderer (incident-hardened — do not simplify away) → `docs/share-cards.md`
- Dev hub (`/labeler/*`), helper servers, and Map-mode WIP → `docs/dev-hub.md`
- Map data pipeline (Blender overheads) → `docs/blender-map-pipeline.md`
- Cross-site architecture, registries & procedures → the **`dailydles` skill**

## Conventions
- Media URLs resolve at the render boundary — always `media(path)` from `lib/media.ts`, never a bare R2 host in stored data.
- PostHog event/prop names are **network-identical across all three sites** (`site` super-property splits them; here `"owdle"`). Never rename on one side only.
- Keep share machinery (`lib/shareUrl.ts`, `functions/og`, `functions/r`) in lockstep with the siblings; bump `RENDER_REV` in `functions/og/r/[code].tsx` on any card-design change.
