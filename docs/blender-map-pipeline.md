# Optimizing Map Calibration & Screenshots via Blender

> Purpose: if Overwatch maps import cleanly into Blender (via DataTool/OWLib +
> `io_scene_owm`), how that lets us optimize OWdle Map mode's **calibration** and
> **screenshot** systems — and what it requires *from Blender*. Written so the current
> Map-mode implementation can be checked for fit. Decision questions for the next
> session are at the end. Last updated 2026-06-28.
>
> Companion doc: `openguessr-brief.md` (reference-game mechanics & scoring model).

---

## What we have today (as of the files read 2026-06-28)

**`data/map-calibrations.json`** — per map:
- `overheadFile` (a 5000×5000 `.webp`, e.g. `/maps/overhead/kings-row.webp`), `overheadW/H`
- `transformAxes: ["worldX","worldZ"]` — only the ground plane; `worldY` (height) is dropped
- `projection: "homography"` + an 8-value `transform`
- `calibrationPoints`: ~6–7 hand-placed `world[x,y,z] ↔ pixel[x,y]` correspondences
- The homography is **fit** from those points.

**`data/spots.json`** — per map, an array of:
- `worldX/worldY/worldZ`, `pixelX/pixelY`, `screenshot` (in-game Steam capture),
  `facingDeg`, `capturedAt`, `sourceFilename`, `editedAt`

**`lib/scoring.ts`** — per round max 5000 = `mapBonus` (1000 right map) + `distancePoints`
(0–4000), where distance is measured in **overhead pixels as a fraction of the long edge**,
bucketed into 7 tiers. Crucially, the header comment states the real workflow:

> "the spot's stored pixel position on the overhead (set at capture time: homography
> projects the world coords, **then the labeler's Nudge step lets the operator drag the pin
> to the visually correct landmark before saving**). Calibration math error doesn't enter
> the player's score — it's already corrected out at capture."

**So today's two costs are:**
1. **Calibration**: hand-place 6–7 correspondence points per map → fit a homography that is
   only *approximately* right (it's a planar projective fit of a non-planar, height-varying
   world, with `worldY` discarded).
2. **Per-spot manual Nudge**: because the homography is approximate, *every captured spot* has
   to be hand-dragged to the correct pixel. That manual correction is the source-of-truth.

Plus the **capture** side: each spot is an in-game screenshot whose `worldX/Y/Z` + `facingDeg`
must be obtained out-of-band (Workshop position readout / manual entry / timestamp matching —
*confirm which*).

---

## What Blender optimizes (and why)

The whole win comes from one fact: **in Blender the overhead and the spot screenshots are
produced by cameras in the same 3D coordinate frame, so projection is exact, not fitted.**

### 1. Calibration: homography-fit + per-spot Nudge → exact, zero-touch
- Render the overhead as an **orthographic top-down render of the actual map mesh**. For an
  ortho camera the `world(X,Z) → pixel` map is **exact and affine** — computed directly from
  the camera's `ortho_scale`, position, and render resolution (or via
  `bpy_extras.object_utils.world_to_camera_view`). No correspondence points, no fitting.
- Because the projection is exact for *every* point (not a 6-point planar approximation),
  the **per-spot Nudge step disappears**: the projected pixel *is* the correct pixel. The
  manual correction existed only to paper over homography error — remove the error, remove
  the step.
- **Integration is low-friction:** an exact ortho projection is just a homography whose
  perspective row is `[0,0,1]`. So you can keep the existing `projection: "homography"` schema
  and `transformAxes: ["worldX","worldZ"]` and simply *populate* `transform` with the exact
  values Blender gives you. `calibrationPoints` becomes vestigial (keep for record or drop).
  Downstream code that consumes the homography doesn't change.

### 2. Screenshots: out-of-band capture → rendered at known pose
- Place a camera at `(worldX, worldY, worldZ)` with yaw = `facingDeg` (and a matched FOV/eye
  height) and **render** the spot image. The world coords are known *by construction* — no
  Workshop position logging, no timestamp matching, no manual coordinate entry.
- The spot's `pixelX/pixelY` is then the *exact* ortho projection of its world position — again
  no Nudge.
- **Batchable & reproducible:** loop hundreds of spots in one headless run; regenerate after a
  map/patch change. Restrictions (grayscale, etc.) become render settings. A true GeoGuessr
  pan-around is free via an **equirectangular (360°) camera** instead of a still.

### Net effect on the existing pipeline
The `MapCalibrate` correspondence-picking and the per-spot **Nudge** in `MapReview`/`MapEdit`
become unnecessary for Blender-sourced maps. `map-calibrations.json` and `spots.json` keep
their shapes; they're just *generated* with exact values instead of fitted + hand-corrected.

---

## What this requires FROM Blender

| Requirement | Blender feature | Notes / risk |
|---|---|---|
| Map imports with usable geometry in **one consistent world frame** | `io_scene_owm` (Blender 4.2+) | The linchpin — see the coordinate-match question below |
| Orthographic top-down overhead render | Ortho camera (`cam.data.type='ORTHO'`, `ortho_scale`) | Trivial |
| **Exact** world→pixel mapping | `world_to_camera_view` / camera matrix | This *is* the calibration; replaces the homography fit |
| Spot render at arbitrary pose | Camera at `(X,Y,Z)`, yaw=`facingDeg`, matched FOV | Must reproduce in-game framing to feel right |
| 360° pan-around (optional upgrade) | `cam.data.type='PANO'` equirectangular (Cycles) | Free path to true GeoGuessr feel |
| Floor height for *new* spots | `scene.ray_cast` | Only needed if generating spots, not reprojecting existing ones |
| Headless batch | `blender --background --python pipeline.py` | Reproducible generation |
| Look/fidelity | Texture import + optional HDRI sky/sun, AO bake | Renders ≠ in-game look by default (see risks) |
| Scripting glue | `bpy` | All of the above is scriptable |

---

## The make-or-break requirement: coordinate-frame match

Everything above assumes the **world coordinates Blender imports match the `worldX/Y/Z`
already stored in `spots.json`** (same origin, scale, axes). If they match — or relate by a
single known transform per map (or globally) — then **all existing spots can be re-projected
exactly with zero recapture**, and only calibration/Nudge are retired. If they *don't* match,
you must either solve the OW-world ↔ Blender-world transform once, or recapture.

Specifics to verify:
- OWdle stores OW world axes as `worldX, worldY (up), worldZ`, scoring on `(X,Z)`.
- Blender is Z-up; `io_scene_owm` imports with *some* axis/scale convention. The OW(X, Y-up, Z)
  → Blender(X,Y,Z) mapping is a fixed transform, but it must be nailed exactly or every
  projection is off.

---

## Two regimes (they have very different payoffs)

1. **Full Blender** — overhead is a Blender ortho render *and* screenshots are Blender renders.
   Maximal win: calibration exact, Nudge gone, answers exact, fully batchable. Cost: accept the
   rendered look; solve coordinate match.
2. **Hybrid: keep current third-party overhead art, Blender only for projection.** Limited win:
   Blender's exact transform is to the *Blender render*, not to the existing `/maps/overhead/*.webp`
   art. If we must keep that art (look/licensing), you need a **one-time** render→art alignment
   (a homography again) — but only **once per map**, not per spot, so Nudge still mostly dies.
   The cleanest full win needs the displayed overhead to *be* the Blender render.

---

## Decision questions for the next session ("does what we have work?")

1. **Coordinate match (critical):** Do `io_scene_owm`'s imported coordinates equal the in-game
   `worldX/Y/Z` in `spots.json` (same origin/scale/axes), or is there a fixed transform? →
   decides *reproject existing spots* vs *recapture*.
2. **Overhead source:** Are `/maps/overhead/*.webp` images we must keep (look/licensing), or can
   we replace them with Blender ortho renders? → decides **Full Blender** (exact) vs **Hybrid**
   (one-time per-map alignment).
3. **Nudge elimination:** With an exact ortho render, does the per-spot Nudge actually go away
   for our maps, or do multi-level/overhang spots (two stacked points → same top-down pixel)
   still need human disambiguation? Quantify how many spots are affected.
4. **Schema fit:** Can `map-calibrations.json` (homography w/ `[0,0,1]` perspective row) and
   `spots.json` keep their current shape, just populated exactly — i.e. minimal code change in
   `lib/affine.ts` / `MapCalibrate` / `MapReview`? Or is a new schema warranted?
5. **Capture method today:** How are `worldX/Y/Z` + `facingDeg` obtained now (Workshop readout?
   manual?)? Confirm a Blender camera at that pose (FOV, eye height, aspect) reproduces the same
   framing players expect.
6. **Fidelity:** Is replacing real in-game JPG screenshots with Blender renders acceptable for
   the game's look (lighting/skybox/props differ), or is the in-game look part of the appeal?
7. **Scoring (optional):** Today's score is *fraction of overhead long edge* (visual pixels), and
   all overheads are 5000². Blender hands us exact real-world meters per map — do we ever want
   meter-based / per-map-scaled scoring (`openguessr-brief.md`), or keep the visual-pixel tiers?
   (Not a blocker — current tiers work without it.)
8. **Extraction durability:** Are DataTool + `io_scene_owm` current with the live OW2 patch for
   the maps we need? (This is the perennial fragile link.)

---

## Sourcing notes
- DataTool/OWLib map extraction → `OWMAP` + `io_scene_owm` Blender importer (Blender 4.2+),
  both actively maintained (OWLib v2.23.0.0, June 2026).
- Blender capabilities cited (ortho/pano cameras, `world_to_camera_view`, `ray_cast`, headless
  `--background --python`) are standard `bpy`.
- Current-system facts are read from this repo's `data/map-calibrations.json`,
  `data/spots.json`, `lib/scoring.ts`, `lib/maps.ts` (May 2026 state; map mode is WIP/untracked,
  so re-verify against the working tree before acting).
