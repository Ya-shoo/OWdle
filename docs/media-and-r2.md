# Media pipeline (R2) & Mac↔PC dev setup

> Deep dive referenced from `AGENTS.md`. Read when touching media assets, `lib/media.ts`, the sync/deploy scripts, or setting up a fresh clone. The general cross-site pipeline lives in the `dailydles` skill; this file is OWdle's specifics.

## Media pipeline (R2)

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

> The `R2_PREFIXES` in `lib/media.ts` and the `SYNC_DIRS` in `scripts/sync-to-r2.mjs` (and the staged dirs in `scripts/build-for-deploy.mjs`) must stay in lockstep — the sync uploads by literal relative path under `public/`, so the local dir name IS the R2 key prefix.

## Mac vs PC dev split

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
