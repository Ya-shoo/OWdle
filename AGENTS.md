<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Media pipeline (R2)

Heavy assets — `public/sounds/`, `public/maps/`, `public/skins/`, `public/voicelines/`, `public/banners/` — live in Cloudflare R2, served via the custom domain `media.playowdle.com`. They are **not in the git repo** (gitignored). Data files in `data/` (sound-clips.json, skins.json, banners.json, quote-conversations.json, spots.json, map-calibrations.json, maps.json) keep RELATIVE paths like `/sounds/ana/biotic-grenade.mp3` — never bake the R2 hostname into stored data.

The remaining `public/` dirs — `portraits`, `abilities`, `splash`, `sfx`, plus `kofi-avatar.jpg` — stay tracked in git and ship via Cloudflare Pages. They're small and change rarely; no R2 sync overhead.

URL resolution at the rendering boundary:

```ts
import { media } from "@/lib/media";
// <img src={media(cal.overheadFile)} />
// <audio src={media(clip.audioUrl)} />
// fetch(media(audioUrl))
// new Audio(media(audioUrl))
```

In production builds `lib/media.ts` resolves the relative path against `https://media.playowdle.com` (default fallback). In dev it falls through to a relative URL served from local `public/` if those files exist.

The build pipeline keeps R2 media out of the Pages deploy by staging the five R2-bound dirs to `.staged-media/` during `next build`, then restoring. The wrapper script is `scripts/build-for-deploy.mjs` and `npm run build:deploy` calls it. The full `npm run deploy:live` chains `sync-to-r2 → build:deploy → wrangler pages deploy → git push` — one command pushes local asset changes to R2, builds the site, deploys to Pages, and pushes the code change to GitHub.

To upload media to R2 outside of a deploy: `npm run sync-to-r2`. Reads `~/.wrangler/config/default.toml` (or platform equivalent) for the OAuth token, walks all five R2-bound dirs, HEAD-checks each key against R2 to skip already-uploaded files, then PUTs the rest at 8× concurrency.

# Mac vs PC dev split

Yash develops OWdle on both Mac and Windows. Either machine can edit and deploy — `npm run deploy:live` syncs local asset changes to R2 first, then builds + deploys + pushes. The five R2-bound dirs (`sounds`, `maps`, `skins`, `voicelines`, `banners`) may or may not exist locally on a given machine depending on what work happens there.

For dev on either machine after a fresh clone:

1. **Wrangler authenticated**: `npx wrangler login` once (so `npm run sync-to-r2` works and production deploys work).
2. **`.env.local` at the repo root** (gitignored) with:
   ```
   NEXT_PUBLIC_MEDIA_BASE=https://media.playowdle.com
   ```
   Without this, `next dev` falls through to relative `/sounds/...` URLs and can't serve them locally (the dirs may not exist on this machine). Setting the env var routes dev fetches at R2.

3. **No need to download media locally**. Either machine can run the full app against R2.

What the Mac side should NOT do without coordinating with Windows:
- `npm run sync-clips` — only works on the PC where the source zips live in `~/Downloads/owdle-clips*.zip`. Mac-side dev pulls finished media from R2.
- `npm run sync-spots` — operates on locally captured spots files. Same reasoning.

# Dev hub

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

Adding a new tool:
1. Create `app/labeler/<tool>/page.tsx` — call `notFound()` when `NODE_ENV === "production"`.
2. Append a row to the `TOOL_GROUPS` config in `app/labeler/page.tsx` (pick the right section, or add a new one).
3. If it needs a helper server: add a `scripts/<tool>-server.mjs`, chain it into the `concurrently` invocation in `npm run dev`, and — if it depends on a secret or other external resource — make startup survive that resource being missing so a clean clone of the repo still gets a working dev flow.

# Tracked-state notes for future sessions

Multiple modes are in-flight. As of the R2 migration commit (`f6efdf6 Move media to Cloudflare R2…`):

- **Sound, Quote, Classic, Ability, Splash modes**: tracked + shipped. Routes are `/sound`, `/quote`, `/classic`, `/ability`, `/splash`.
- **Map mode**: WIP, mostly untracked on Yash's Windows PC. Files include `components/MapGame.tsx`, `components/MapReview.tsx`, `components/MapCalibrate.tsx`, `components/MapEdit.tsx`, `components/MapAdmin.tsx`, `lib/affine.ts`, `lib/calibration-mode.ts`, `lib/mapDetection.ts`, `lib/maps.ts`, `lib/scoring.ts`, `lib/storage.ts` (modifications), `app/labeler/map/**`, `app/map/`. **None of these are pushed yet** — see `git stash list` for any stashed-and-not-yet-restored state and your local working tree for current map work.
- The R2 migration commit included `media()` wrapping in tracked components (SoundGame, QuoteGame, WaveformPlayer). Map mode components already use `media()` in their untracked state and will continue to work when committed.
- `data/sound-clips.json` is up-to-date through all 49 heroes (35 DPS/support + 14 tanks added in the R2 migration commit).

# OG share-card hardening (ported from Deadlockle, 2026-06-06)

The /og/r/[code] renderer carries the full reliability stack proven on
Deadlockle's launch night — keep the two repos in lockstep:

- **Renders persist to R2** (`OG_CACHE` → shared `dailydles` bucket, keys
  `og-cache/owdle/<REV>/<code>.png`): free-plan Workers CPU limits kill ~half
  of COLD wasm renders (lazy resvg/yoga init inside the request), so each code
  renders once and every later request serves storage. **Bump RENDER_REV in
  functions/og/r/[code].tsx whenever the card design changes** — stored
  renders are immortal. Local dev bypasses storage (live render always).
- **Fonts are self-hosted subsets** (`public/og-fonts/`, regenerated by
  `scripts/fetch-og-fonts.mjs`) — the render path never leaves the zone. If a
  card ever renders a NEW glyph, add it to that script's SUBSET and re-run, or
  it draws as tofu. (✓/✕ are inline SVG, not text.)
- The sharer's prefetch (ShareButton) and the modal preview (ShareModal) both
  RETRY failed loads — the sharer's device shoulders the one cold render each
  code needs. **Retries fetch DISTINCT URLs** (`ogRetrySrc` adds `?r=N`):
  WebKit replays a same-URL image failure from its in-session memory cache
  without re-requesting (no-store notwithstanding), which silently made every
  retry a no-op on iOS — daily-summary codes (per-player unique, never
  prewarmed) showed "Preview unavailable" and went un-warmed for unfurlers.
  The query param is invisible server-side (R2 keys on the path code alone).
- `.github/workflows/prewarm-og.yml` renders all ~98 possible round codes
  daily after the 2:15am reset (dual UTC crons for DST). Daily-summary codes
  stay on-demand.
- The announce modal embeds a PRE-BAKED card (`public/announce-example.png`),
  not a live render. Regenerate after design changes:
  `curl -s https://playowdle.com/og/r/260605-32432-00 -o public/announce-example.png`
