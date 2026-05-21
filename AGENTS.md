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

Current tools:

- `/labeler/` — audio labeler. Loads a capture video, lets you mark in/out ranges per ability, exports a ZIP of trimmed clips for `npm run sync-clips`.
- `/labeler/votes/` — embeds the votes admin dashboard (next-game vote tally across OWdle + Deadlockle).

`npm run dev` is wired through `concurrently` to start three processes in parallel: `next dev`, `scripts/votes-admin-server.mjs` (votes proxy on `:8788`, reads `ADMIN_SECRET` from `.env.secrets`), and `scripts/sound-trims-server.mjs` (sound clip trim editor). Use `npm run dev:next` if you only want Next without the helpers.

Adding a new tool:
1. Create `app/labeler/<tool>/page.tsx` — call `notFound()` when `NODE_ENV === "production"`.
2. Add an entry to the `TOOLS` array in `components/DevHubNav.tsx`.
3. If it needs a helper server (proxying secrets, hitting D1, etc.), add a `scripts/<tool>-server.mjs` and append it to the `concurrently` chain in `dev` and the `--kill-others-on-fail` group.

# Tracked-state notes for future sessions

Multiple modes are in-flight. As of the R2 migration commit (`f6efdf6 Move media to Cloudflare R2…`):

- **Sound, Quote, Classic, Ability, Splash modes**: tracked + shipped. Routes are `/sound`, `/quote`, `/classic`, `/ability`, `/splash`.
- **Map mode**: WIP, mostly untracked on Yash's Windows PC. Files include `components/MapGame.tsx`, `components/MapReview.tsx`, `components/MapCalibrate.tsx`, `components/MapEdit.tsx`, `components/MapAdmin.tsx`, `lib/affine.ts`, `lib/calibration-mode.ts`, `lib/mapDetection.ts`, `lib/maps.ts`, `lib/scoring.ts`, `lib/storage.ts` (modifications), `app/labeler/map/**`, `app/map/`. **None of these are pushed yet** — see `git stash list` for any stashed-and-not-yet-restored state and your local working tree for current map work.
- The R2 migration commit included `media()` wrapping in tracked components (SoundGame, QuoteGame, WaveformPlayer). Map mode components already use `media()` in their untracked state and will continue to work when committed.
- `data/sound-clips.json` is up-to-date through all 49 heroes (35 DPS/support + 14 tanks added in the R2 migration commit).
