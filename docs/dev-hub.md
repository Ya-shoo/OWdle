# Dev hub (`/labeler/*`) & helper servers

> Deep dive referenced from `AGENTS.md`. Read when adding a dev tool, wiring a helper server, or working on Map mode.

Local-only tools live at `/labeler/*` (dev-only — production builds emit 404s for every page under it via `notFound()` in `app/labeler/layout.tsx`). Open them at `http://localhost:3000/labeler/` after `npm run dev`. The vision is one place where both OWdle and Deadlockle internal workflows live — test new features, edit/correct data, optimize before launching.

The hub itself is at `app/labeler/page.tsx` — a server-rendered index of every tool, grouped into sections (Map mode, Sound mode, Site admin, Play) via the `TOOL_GROUPS` config. Adding a tool means appending a row there, not editing a separate nav component.

Current tools:

- `/labeler/sound/` — audio labeler. Loads a capture video, lets you mark in/out ranges per ability, exports a ZIP of trimmed clips for `npm run sync-clips`.
- `/labeler/map/{calibrate,review,edit,admin}/` — map mode labeling pipeline (calibrate overhead, review screenshots, edit pins, aggregate spot feedback).
- `/labeler/votes/` — embeds the votes admin dashboard (next-game vote tally across OWdle + Deadlockle).
- `/labeler/feedback/` — embeds the free-form feedback admin dashboard.

`npm run dev` is wired through `concurrently` to start six processes in parallel: `next dev`, `scripts/votes-admin-server.mjs` (`:8788`), `scripts/feedback-admin-server.mjs` (`:8790`), `scripts/sound-trims-server.mjs` (`:8789`), `scripts/palette-server.mjs` (`:8791`), and `scripts/og-dev-server.mjs` (`:8799`). One command, every dev tool reachable. `npm run dev:next` runs Next alone.

The og helper runs the Cloudflare Pages Functions (`functions/` — the `/og/r/[code]` share-card renderer and `/r/[code]` meta shell) locally via `wrangler pages dev`, because `next dev` has no functions runtime. `lib/shareLinks.ts` points the share modal's preview at `:8799` when `NODE_ENV === "development"` — keep the port in sync between those two files. Like the other helpers it survives missing resources (creates an empty `out/` if the site was never built; idles instead of killing the stack if wrangler can't boot).

The votes / feedback helpers proxy authenticated requests to the live site using `ADMIN_SECRET` from `.env.secrets`. That file is gitignored and not committed to either machine by default. **The helpers are designed to survive a missing `.env.secrets`** — they still boot, but serve a "viewer offline · set ADMIN_SECRET" stub page instead of the real dashboard. The `npm run dev` flow therefore works on a fresh clone without ceremony; you only need `.env.secrets` when you actually want to read prod votes / feedback data, and then it's drop-the-file-and-restart.

## Adding a new tool
1. Create `app/labeler/<tool>/page.tsx` — call `notFound()` when `NODE_ENV === "production"`.
2. Append a row to the `TOOL_GROUPS` config in `app/labeler/page.tsx` (pick the right section, or add a new one).
3. If it needs a helper server: add a `scripts/<tool>-server.mjs`, chain it into the `concurrently` invocation in `npm run dev`, and — if it depends on a secret or other external resource — make startup survive that resource being missing so a clean clone of the repo still gets a working dev flow.

## Map mode — tracked state (WIP)
Map mode is mostly untracked on Yash's Windows PC. Files include `components/MapGame.tsx`, `components/MapReview.tsx`, `components/MapCalibrate.tsx`, `components/MapEdit.tsx`, `components/MapAdmin.tsx`, `lib/affine.ts`, `lib/calibration-mode.ts`, `lib/mapDetection.ts`, `lib/maps.ts`, `lib/scoring.ts`, `lib/storage.ts` (modifications), `app/labeler/map/**`, `app/map/`. Check `git stash list` for stashed-and-not-yet-restored state and the local working tree for current map work before assuming what's committed. Map components already use `media()` and will keep working when committed.
