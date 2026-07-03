# How OpenGuessr Works — Reference Brief

> Purpose: a self-contained primer on OpenGuessr's mechanics and scoring, written to
> seed design decisions for OWdle's Overwatch "GeoGuessr" (Map mode). Reference doc —
> not a spec for OWdle itself. Last updated 2026-06-28.

## What it is (one line)
OpenGuessr is a free, browser-based GeoGuessr clone: it drops you into a Google Street
View panorama somewhere on Earth with no hints, and you score by pinning where you think
you are on a world map — the closer the pin, the higher the score. (Made by indie studio
PaulPlay; free with unlimited play.)

## Core game loop
1. **Spawn** — player is placed in a 360° street-level panorama at a random location, no hints.
2. **Investigate** — pan / zoom / "walk" the road, reading clues (signage language & script,
   driving side, license plates, vegetation, architecture, sun position, bollards).
3. **Guess** — click a point on a mini-map (overlay in a screen corner).
4. **Reveal** — submit to see the true location, the **distance** between guess and truth,
   and the points awarded.
5. **Repeat** — a standard game is **5 rounds**; scores sum to a final total.

Imagery is Google Street View. "Maps" (the world map, or curated custom maps) just define
which pool of locations gets served.

## Scoring (the part worth copying carefully)
Points are a function of one thing: **distance from guess to true location**, with
**exponential decay** and a hard cap.

```
score = 5000 · e^(−distance / D)
```

- **Per round:** capped at **5,000** (a pinpoint guess). 5 rounds → **25,000 max**.
- **Shape:** a perfect guess ≈ 5000; the score falls off exponentially as distance grows and
  asymptotes toward 0. Closing the last few km matters far more than the first few hundred.
- **`D` is a per-map scale factor, not a constant.** This is the crucial detail:
  GeoGuessr/OpenGuessr scale the decay rate to the **size of the active map** (roughly its
  bounding-box diagonal). A tiny single-city custom map uses a small `D` (steep falloff — you
  must be very precise); the whole-Earth map uses a large `D` (gentle falloff — being 20 km
  off still scores well). The same formula "feels fair" on both only because `D` tracks map size.
- Distance on Earth is great-circle (haversine) distance in km/m. Result is rounded to an integer.

(The exact constant has shifted across GeoGuessr versions and is map-dependent; the reliable,
transferable facts are: 5000 cap, exponential decay, and per-map scaling of `D`.)

## Modes & difficulty modifiers (feature menu to consider)
- **Single-player classic**, **live multiplayer**, **1v1 duels** (real-time head-to-head),
  **daily competitions** + leaderboards.
- Variant modes: **Country Guesser** (name the country only), **Image Guesser** (still photo
  instead of panorama).
- **Restrictions** that gate clues: **No Move / No Pan / No Zoom** (combined = "NMPZ", the
  hardest), **grayscale**, **timed rounds**.
- Thousands of **community-made custom maps** (themed by region, megacities, abandoned places,
  etc.); hosts pick map + round length + restrictions.

---

## Porting to Overwatch — the design forks this raises
The Earth model doesn't map 1:1 onto Overwatch. The decisions to make:

1. **Two-part guess vs one-part.** Earth is one continuous coordinate space; Overwatch is ~40
   discrete maps, each with its own 2D space. So a round implicitly asks two questions:
   *which map?* and *where on that map?* Pick one:
   - Tell the player the map; they only pin the **location** (pure GeoGuessr-on-one-map).
   - Make them identify the **map too** (combined score, or a harsh penalty / zero for wrong-map).

2. **Coordinate space & distance metric.** Replace haversine-on-a-sphere with **Euclidean
   distance in a single calibrated 2D space per map**. This is why a calibration step
   (screenshot → consistent overhead coordinates, e.g. an affine transform) matters — without
   it, "distance" isn't comparable across spots or expressible in real meters.

3. **Per-map `D` is non-optional here.** Overwatch maps vary enormously in scale (a tight
   Control point vs. a long Escort lane). Hardcoding one decay constant will make small maps
   trivially easy and big maps punishing. Set `D` from each map's actual extent (diagonal of
   its playable bounds), exactly as GeoGuessr scales per custom map. Decide the units you score
   in: calibrated meters > raw screenshot pixels (pixels aren't comparable across maps or image
   sizes).

4. **Panorama vs. static shot.** OpenGuessr lets you move/pan/zoom for clues. An Overwatch
   version most naturally gives a **single fixed screenshot** of a spot — which is effectively
   GeoGuessr's hardest "NMPZ" restriction by default. Worth deciding deliberately: static
   screenshot (hard, simple to build) vs. a short pan/clip or multiple angles (easier, more
   data to capture).

5. **Round count & cap.** The 5-rounds / 5000-per / 25000-max convention is clean and familiar;
   mirroring it gives players an intuitive scoreboard for free.

6. **Clue parity.** Earth clues (language, driving side) don't exist; Overwatch clues are map
   geometry, hero-agnostic landmarks, skyboxes, signage/props, lighting. The "what's a fair,
   identifiable spot" question is the content-curation equivalent of GeoGuessr choosing good
   Street View locations.

---

## Sourcing notes
- openguessr.com itself is gated behind a Cloudflare Turnstile that blocks automated browsers;
  the CrazyGames-hosted copy loads the shell but pulls game content from openguessr.com (which
  errored in an automated session), so a live round could not be observed firsthand.
- This brief is assembled from the developer's own page (paulplay.studio/openguessr), the
  CrazyGames listing (developer: PaulPlay; 9.0 rating), and multiple corroborating write-ups
  plus the documented GeoGuessr scoring model (5000 cap, exponential decay, per-map scaling).
