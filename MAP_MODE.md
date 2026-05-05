# Map Mode — Build Spec

The 6th and final mode in OWdle's canonical order (`classic → quote → ability → splash → sound → map`). A daily Overwatch GeoGuessr: shown an in-game POV screenshot, the player clicks a pin on the map's overhead view; distance + map identification determine the round score.

This file captures what's been decided and what still needs sign-off before building. It's the resume point for future build sessions — read top to bottom and you should know where to pick up.

---

## Status snapshot

- **Architecture:** locked.
- **Capture pipeline:** locked (Workshop + OCR, see §4).
- **Asset sources:** locked.
- **Game UX details (round count, scoring, scope):** **not yet locked** — see §3.
- **Code:** none written.

---

## 1. Decided

These are committed. Don't relitigate without a reason.

1. **Mode is GeoGuessr-style, not "guess the map name."** Show POV → click pin on overhead. Distance scoring.
2. **Capture pipeline = Workshop + OCR.** Pixel-perfect coordinates from in-game Workshop scripts, OCR'd off-screen by a Windows desktop tool. (See §4 for full workflow.) Yash plays OW on Windows, so this is feasible.
3. **Three-piece system:**
   - In-game **Workshop script** (free-cam + coordinate HUD)
   - Windows **capture tool** (`owdle-capture.exe`, Python + PyInstaller)
   - Web **labeler/calibration tool** at `app/labeler/map/` in the OWdle Next.js app
4. **Per-map calibration is one-time, manual, ~3 min per map.** 4+ landmark `(world coord, overhead pixel)` pairs → 6-parameter 2D affine transform → saved per-map. After calibration, every capture auto-projects onto that map's overhead. (Math in §5.)
5. **Z is metadata, not part of the pin.** XY pin only. Z saved to disambiguate vertically-stacked spots (Hanamura courtyard vs. balcony) for filtering and difficulty tagging — never for the click target.
6. **Every spot is human-reviewed.** The labeler shows each auto-projected pin with Accept / Nudge / Reject. No spot lands in `data/spots.json` without an explicit accept.
7. **Asset sources for overheads:**
   - **Statbanana** (Drive direct links, attribution required) — high-res orthographic for the 21 OW1-era maps. https://overwatch.statbanana.com/images
   - **Fandom MediaWiki API** (same pattern as `scripts/build-skins.mjs`) — for newer maps (Push, Flashpoint, Clash, Stadium-only, post-2022 additions).
8. **POV screenshots come from Workshop captures**, not scraped from the web. Web-scraped shots leak HUD info or have inconsistent quality. The Windows tool will save *clean* (HUD-free) screenshots — capture them with the OW UI hidden via `Ctrl+Shift+F11`, or post-process inpaint the coord HUD region away.

## 2. Recommended (but not yet ratified — pick before building game UI)

These got recommendations but Yash hasn't locked them. **Decide these before §6 step 4.** They don't block capture work (§6 steps 1–3 + capture sprint), so it's fine to start asset acquisition without them — but the game UI shape depends on them.

| # | Decision | Recommendation | Alternative |
|---|---|---|---|
| 1 | Does the player know what map they're seeing? | **No** — pure GeoGuessr; map identity is part of the puzzle | Show map name above POV; pure spatial guess |
| 2 | Rounds per day | **5** — fits the "big finale" mode of OWdle | 1 round/day, Wordle-style simplicity |
| 3 | Launch scope | **10 maps × 20 spots = 200 spots** with pipeline scaled to add more incrementally | Full 50-map launch (~1500 spots = several-week capture marathon) |
| 4 | Scoring | **GeoGuessr-style:** per round max 5000 = `mapBonus + distancePoints`. Right map = `1000 + 4000 * exp(-pixelDistance / k)` where `k = overheadDiagonal / 5`. Wrong map = 0 distance points (`mapBonus` lost too). 5 rounds → 0–25000. | Simpler distance-only, no map bonus |
| 5 | Pin UX | **Click → tentative pin → Confirm button → reveal** | Click = instant commit |

Recommended **launch map set** (if #3 is locked at 10): Hanamura, King's Row, Dorado, Ilios, Watchpoint Gibraltar, Eichenwalde, Hollywood, Numbani, Lijiang Tower, Junkertown. Visually iconic, all available on Statbanana, broad gamemode coverage.

## 3. Architecture

```
┌──────────────────┐   F8 hotkey   ┌─────────────────────┐
│  Overwatch       │ ────────────► │  owdle-capture.exe  │
│  (Custom Game,   │               │  (Windows tray app) │
│   Workshop:      │               │                     │
│   free-cam +     │               │  - screenshot OW    │
│   coord HUD)     │               │  - crop HUD strip   │
└──────────────────┘               │  - Tesseract OCR    │
                                   │  - parse {map,x,y,z}│
                                   │  - save .png + .json│
                                   └──────────┬──────────┘
                                              │
                                              ▼
                          ┌────────────────────────────────┐
                          │  Shared folder (Dropbox/iCloud)│
                          │  captures/                     │
                          │    20260504-1342_kingsrow.png  │
                          │    20260504-1342_kingsrow.json │
                          └────────────────┬───────────────┘
                                           │
                                           ▼
┌──────────────────────────────────────────────────────────────┐
│  OWdle Next.js (on Mac)                                      │
│                                                              │
│  /labeler/map/calibrate     /labeler/map/review              │
│   (one-time per map)         (every session)                 │
│   ↓ writes                    ↓ writes                       │
│   data/map-calibrations.json  data/spots.json                │
│                               public/maps/spots/{id}.jpg     │
│                                                              │
│  /map  (the game)                                            │
│   reads data/spots.json + map-calibrations.json + maps.json  │
└──────────────────────────────────────────────────────────────┘
```

## 4. The capture pipeline in detail

### 4.1 In-game side (Workshop)

A custom game with a Workshop script that:
- Detaches the player from gravity/collision (free-cam) — fork an existing community workshop mode rather than writing from scratch. Search [workshop.codes](https://workshop.codes/) for "free camera" / "spectator" / "developer mode."
- Displays `Position Of(Event Player)` as `Create HUD Text` at top-center, in three lines:
  - `MAP: {Current Map}`
  - `X: {Round To Integer(X Component Of(Position Of(Event Player)), Up)}`
  - `Y: {Round To Integer(Y Component Of(Position Of(Event Player)), Up)}`
  - `Z: {Round To Integer(Z Component Of(Position Of(Event Player)), Up)}`
- White text on dark backing for OCR cleanliness. Monospace where possible.

Setup once, save the workshop preset, reuse forever.

### 4.2 Windows capture tool (`owdle-capture.exe`)

Stack: **Python + PyInstaller** (~150 lines). Single .exe, no installer.
- `mss` — fast screen capture (no game-process touching, safe vs. Warden)
- `pytesseract` — OCR
- `keyboard` — global hotkey (F8 for capture-with-HUD-visible, F9 for HUD-hidden capture)
- `Pillow` — cropping, optional inpaint of HUD region

Behaviors:
- Hotkey-driven (no continuous capture)
- Crops the HUD strip (~400×120 px, top-center; one-time per-resolution config)
- OCRs `MAP / X / Y / Z` lines
- Writes two files to a watch folder:
  - `captures/{ISO_timestamp}_{mapKey}.png` — full screenshot
  - `captures/{ISO_timestamp}_{mapKey}.json` — `{ map, x, y, z, captured_at, screen_w, screen_h }`
- F9 variant: capture with `Ctrl+Shift+F11` UI-hide already toggled, OR post-process inpaint the HUD strip — these are the screenshots that will actually be used as in-game stimulus

Watch folder lives in a cloud-synced directory (Dropbox / iCloud Drive / Drive) so the Mac labeler sees new captures within seconds.

**Anti-cheat note:** uses only Windows screen capture APIs. No process injection, no memory reading, no packet inspection. Safe vs. Warden in the same way OBS Game Capture is safe.

### 4.3 Web labeler (`app/labeler/map/`)

Two modes inside one tool, modeled on the existing `app/labeler/` (the audio segmenter).

**Calibrate mode** (one-time per map):
- Pick map → load its overhead from `public/maps/overhead/{key}.png`
- Drag in (or auto-detect) 4+ calibration captures
- For each, click the corresponding pixel on the overhead
- Tool fits 6-parameter affine transform via least-squares
- Saves to `data/map-calibrations.json`
- Sanity-check view: capture a 5th landmark, see auto-projection, verify

**Review mode** (every session after):
- Auto-watches the captures folder
- For each new capture, auto-projects via the saved transform
- Three buttons per spot: **Accept** (commit) / **Nudge** (drag pin to correct) / **Reject** (discard)
- Accepted entries append to `data/spots.json`; screenshots copy to `public/maps/spots/{spot-id}.jpg`
- Should also support hand-pinning loose screenshots without coords (for Fandom area shots, your old screenshots, etc.) — same UI, no auto-project step

## 5. Calibration math

World coords → overhead pixels via 2D affine transform:

```
overheadPx = a·worldX + b·worldY + c
overheadPy = d·worldX + e·worldY + f
```

6 unknowns. Each calibration point gives 2 equations. 4 points = 8 equations = over-determined system. Solve by least-squares.

Storage shape (`data/map-calibrations.json`):
```json
{
  "kings-row": {
    "overheadFile": "/maps/overhead/kings-row.png",
    "overheadW": 5000,
    "overheadH": 2500,
    "transform": [a, b, c, d, e, f],
    "calibrationPoints": [
      { "world": [12.3, -45.7, 8.0], "pixel": [1234, 678] },
      ...
    ],
    "calibratedAt": "2026-05-04T13:42:00Z"
  }
}
```

**Reliability expectations:**
- Clean orthographic overhead (Statbanana) + 4 well-spread landmarks → pin within 2–8 px on a 2000px overhead. Imperceptibly accurate.
- Slight perspective overhead (some Fandom maps tilt 5–10°) → pin within 10–25 px. Still in the right room.
- Stitched overheads with edge distortion → up to 30–50 px at edges. Mitigation: use 6–8 calibration points to spread error, OR rely on the Nudge step to fix outliers.

**Failure modes & mitigations:**
- *Multi-level XY collisions* (Hanamura balcony vs. courtyard): Z metadata in spot record; surface in game UI as a level tag.
- *Swap to a different overhead image for the same map*: must re-calibrate. Calibration is paired to the overhead file, not the map.
- *World-coord origin varies across maps*: irrelevant; each map has its own calibration. Never compare coords across maps.

**Why not auto-align?** No signal in the overhead image alone to derive game-world alignment. Image-feature-matching (SIFT/ORB) would need a programmatic top-down OW render to match against, which doesn't exist. ML landmark detection is heavier than 4 manual clicks. Keep it simple.

## 6. File and path conventions

```
OWdle/
├── MAP_MODE.md                        # this file
├── app/
│   ├── labeler/
│   │   └── map/                       # calibration + review tool
│   │       └── page.tsx
│   └── map/
│       └── page.tsx                   # the game
├── components/
│   └── MapGame.tsx                    # mode component (new)
├── lib/
│   ├── daily.ts                       # add getMapRoundsForDay(day, n)
│   ├── modes.ts                       # flip map.built = true on launch
│   └── storage.ts                     # widen ModeState; see §7
├── data/
│   ├── maps.json                      # map list (key, label, location, gamemode, overheadFile)
│   ├── map-calibrations.json          # per-map affine transforms
│   └── spots.json                     # all spots: { id, mapKey, worldX, worldY, worldZ, pixelX, pixelY, screenshot, level? }
├── public/
│   └── maps/
│       ├── overhead/{key}.png         # reference overheads
│       └── spots/{spot-id}.jpg        # POV screenshots
└── scripts/
    └── build-overheads.mjs            # fetches Statbanana + Fandom

# SEPARATE — not in the OWdle Next.js repo
windows-capture/
├── capture.py
├── build-exe.bat
├── config.json                        # HUD crop region per resolution
└── README.md                          # setup steps for Yash
```

## 7. Data shape & storage

`ModeState` in `lib/storage.ts` currently assumes a hero-keyed guess list:
```ts
type ModeState = { day, guesses: string[], won: boolean, gaveUp?, bonus? };
```

Map mode breaks this — guesses are per-round, with both a map key and pixel coords. **Widen the type:**
```ts
type MapRoundResult = {
  spotId: string;
  guessedMap: string | null;     // null = skipped
  guessedPx: [number, number] | null;
  pointsMap: number;             // 0 or 1000
  pointsDistance: number;        // 0–4000
  pointsTotal: number;
};

type ModeState = {
  day: string;
  guesses: string[];             // legacy; unused for map mode
  won: boolean;
  gaveUp?: boolean;
  bonus?: { ... };
  mapRounds?: MapRoundResult[];  // map mode only; up to 5 entries
};
```

`getMapRoundsForDay(day, n)` selects 5 spots seeded by `owdle:map:{day}`, with constraints to avoid (a) two rounds on the same map, (b) two rounds within K px of each other.

## 8. Build order

Strict sequencing — each step validates the next.

1. **Workshop script (Yash, in-game).** Fork a free-cam workshop mode; bolt on the coord HUD. Test on one map. *Not blocking on me.*
2. **Capture tool MVP (Python).** `capture.py` with hotkey + screenshot + crop + OCR + JSON write. Iterate the OCR crop region until it parses cleanly off the Workshop HUD. *I can write this.*
3. **Calibration page** at `/labeler/map/calibrate`. Load overhead, paste/drop 4 captures, click 4 points, fit transform, save. *I can write this.*
4. **Review page** at `/labeler/map/review`. Auto-watch captures folder, project, accept/nudge/reject, append to `spots.json`. *I can write this.*
5. **Smoke test.** Calibrate one map (King's Row) end-to-end, capture 25 spots, verify they all project sensibly. *Joint.*
6. **Lock the open decisions in §2.** Especially round count + scoring before §6.7.
7. **Game UI** — `MapGame.tsx`, single-screen layout: POV image, sidebar map picker, overhead pin target on selected map, confirm/reveal, score. 5-round daily loop with `getMapRoundsForDay`. Share card.
8. **Capture sprint.** Remaining 9 launch maps. ~3–4 hours of capture sessions.
9. **Launch.** Flip `built: true` in `lib/modes.ts`.
10. **Post-launch:** add maps incrementally; never re-launch.

Estimated total effort to launch from cold start: **~1 week of evenings** plus capture time.

## 9. Open questions / known unknowns

- **Workshop free-cam availability** — confirmed possible but specific share code TBD when Yash searches workshop.codes. Could end up writing a minimal version (Path B from earlier discussion) if no good fork exists.
- **HUD strip OCR reliability across resolutions** — needs prototyping. May need per-resolution crop config.
- **Inpaint vs. UI-hide for clean screenshots** — UI-hide via `Ctrl+Shift+F11` is cleaner if it persists across captures; inpaint is a fallback.
- **Cloud-sync latency** — Dropbox/iCloud sync usually <5s but can stall. May want the Windows tool to also write a `latest.json` index file or push notifications.
- **Spot answer overlap with Sound mode bonus round?** — irrelevant; map mode is its own pool.
- **Mobile UX** — pin-clicking on a small overhead on mobile needs care. Might require a fullscreen overhead modal step. Not blocking launch but lock the design before §6.7.

## 10. References

- **OverFast API** — already used for hero/banner data; only one promo screenshot per map, not useful for spots. https://overfast-api.tekrop.fr/maps
- **Statbanana** (overhead images, 21 OW1 maps, attribution required) — https://overwatch.statbanana.com/images
- **Overwatch Fandom Wiki** — already used in `build-skins.mjs` via MediaWiki API. Map pages have top-down views like `King's_Row_Top_Down_View.jpg`. https://overwatch.fandom.com/wiki/Maps
- **Workshop.codes** (community workshop mode share) — https://workshop.codes/
- **OverGuessr** — prior art, in-game GeoGuessr clone via Workshop. Confirms the loop is fun. Workshop code H0TKZ. https://workshop.codes/H0TKZ
- **Esports Tales callouts** (annotated overheads, 16 maps) — https://www.esportstales.com/overwatch/all-overwatch-map-callouts
- **Liquipedia OW Maps portal** — clean per-map URL pattern, light asset coverage. https://liquipedia.net/overwatch/Portal:Maps

---

*Last updated: 2026-05-04. When you resume, re-read §1 (decided) and §2 (open). If §2 is now decided, update this file.*
