<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Media pipeline (R2)

Heavy assets — every `public/sounds/<hero>/<slug>.{mp3,mp4}`, `public/maps/overhead/<key>.webp`, and `public/maps/spots/<key>/<id>.jpg` — live in Cloudflare R2, served via the custom domain `media.playowdle.com`. They are **not in the git repo** (gitignored). Data files in `data/` (sound-clips.json, spots.json, map-calibrations.json, maps.json) keep RELATIVE paths like `/sounds/ana/biotic-grenade.mp3` — never bake the R2 hostname into stored data.

URL resolution at the rendering boundary:

```ts
import { media } from "@/lib/media";
// <img src={media(cal.overheadFile)} />
// <audio src={media(clip.audioUrl)} />
// fetch(media(audioUrl))
// new Audio(media(audioUrl))
```

In production builds `lib/media.ts` resolves the relative path against `https://media.playowdle.com` (default fallback). In dev it falls through to a relative URL served from local `public/` if those files exist.

The build pipeline keeps R2 media out of the Pages deploy by staging `public/sounds` + `public/maps` to `.staged-media/` during `next build`, then restoring. The wrapper script is `scripts/build-for-deploy.mjs` and `npm run build:deploy` calls it. The full `npm run deploy:live` chains `build:deploy → wrangler pages deploy → git push`.

To upload new media to R2: `npm run sync-to-r2`. Reads `~/.wrangler/config/default.toml` (or platform equivalent) for the OAuth token, walks `public/sounds` + `public/maps`, HEAD-checks each key against R2 to skip already-uploaded files, then PUTs the rest at 8× concurrency.

# Mac vs PC dev split

Yash develops OWdle on a Mac and captures Overwatch screenshots/audio on Windows. The Windows PC has the local `public/sounds` + `public/maps` directories populated as capture working state. The Mac doesn't.

For Mac dev to work after a fresh clone, the Mac needs:

1. **Wrangler authenticated**: `npx wrangler login` once (so `npm run sync-to-r2` works if Yash ever uploads from Mac, and so production deploys work).
2. **`.env.local` at the repo root** (gitignored) with:
   ```
   NEXT_PUBLIC_MEDIA_BASE=https://media.playowdle.com
   ```
   Without this, `next dev` on Mac falls through to relative `/sounds/...` URLs and can't serve them locally (there are no files in `public/sounds`). Setting the env var routes dev fetches at R2.

3. **No need to download media locally**. The Mac can run the full app against R2 — sound mode plays from R2, map mode (when shipped) projects spots against R2-hosted overheads.

What the Mac side should NOT do without coordinating with Windows:
- `npm run sync-clips` — only works on the PC where the source zips live in `~/Downloads/owdle-clips*.zip`. Mac-side dev pulls finished media from R2.
- `npm run sync-spots` — operates on locally captured spots files. Same reasoning.

# Tracked-state notes for future sessions

Multiple modes are in-flight. As of the R2 migration commit (`f6efdf6 Move media to Cloudflare R2…`):

- **Sound, Quote, Classic, Ability, Splash modes**: tracked + shipped. Routes are `/sound`, `/quote`, `/classic`, `/ability`, `/splash`.
- **Map mode**: WIP, mostly untracked on Yash's Windows PC. Files include `components/MapGame.tsx`, `components/MapReview.tsx`, `components/MapCalibrate.tsx`, `components/MapEdit.tsx`, `components/MapAdmin.tsx`, `lib/affine.ts`, `lib/calibration-mode.ts`, `lib/mapDetection.ts`, `lib/maps.ts`, `lib/scoring.ts`, `lib/storage.ts` (modifications), `app/labeler/map/**`, `app/map/`. **None of these are pushed yet** — see `git stash list` for any stashed-and-not-yet-restored state and your local working tree for current map work.
- The R2 migration commit included `media()` wrapping in tracked components (SoundGame, QuoteGame, WaveformPlayer). Map mode components already use `media()` in their untracked state and will continue to work when committed.
- `data/sound-clips.json` is up-to-date through all 49 heroes (35 DPS/support + 14 tanks added in the R2 migration commit).
