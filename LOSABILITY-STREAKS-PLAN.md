# Plan: Losability, Streaks, and Player Stats

End-to-end design + implementation plan for adding real lose states, a
daily streak system, global player-stat infrastructure, and an
Overwatch-tier daily score badge to OWdle. Phases 1–3 are implemented
(uncommitted on `map-mode`); Phase 3.5 (tier system) is the open work.

This document is intentionally self-contained so a fresh Claude Code
conversation can pick up the open work without re-deriving context.

---

## Original prompts (verbatim, in order)

### 1 — The kick-off

> users need to feel that its possible to lose in these games. lets work
> on owdle. also add the streak system (you can reference what we did for
> deadlockle - in terms of layout) and adapt the design accordingly.
> count any pre-existing streaks for users where applicable. What are
> your recommendations for the max allowed attempts per mode. lets go
> through each individually and review your recommendations. You can use
> posthog data for deadlockle as well

### 2 — Quick correction

> I meant posthog data for owdle

(OWdle's PostHog only auto-captures `$pageview` / `$pageleave` /
`$exception` per `instrumentation-client.ts`. No custom game events
exist. The per-mode cap recommendations had to be design-driven.)

### 3 — Locking in per-mode caps + lose semantics

> Classic: 8 guess limit. Similar hint mode like deadlockle. But using a
> hint costs a life. Users should know that.
>
> Sound: 8 guess limit. Full sound should unlock after 7 guesses. 8 is
> okay bc users also have context clues with hero attributes. Skip turn
> costs a guess.
>
> Quote: 8 guess limit. Make it so audio is available at 5 and 7. This
> might be too easy as they will be able to hear the heroes voice. We
> will adjust with more data.
>
> Ability: 12 guess limit. Watch analytics to see if users find it too
> easy.
>
> Splash: 5 guess limit. Adjust the zoom so that if it were to go to
> guess 8 it would be fully zoomed out. (But we're keeping the limit at
> 5 to create proper tension) Watch analytics might be too hard.
>
> These should be real loss states if users fail to guess within the
> guess limits. show correct answer on result page with slight red
> background indicating user missed it. This should also reflect on
> their score both overall after all modes and in the header.
>
> Streaks should be based on play/engagement (not whether they got all
> modes correct)
>
> Have the guesses remaining feel minimal and but prominent so users
> know how many they have left (when playing a mode) yellow when under
> half, gradually gets more red the closer it gets to one guess
> remaining. streaks are counted if every mode is finished. lets have
> losses auto-reveal the answer in muted cards with better luck tomorrow
> text AND build out infrastructure so we can also show "% of players
> who got todays ___ mode" and "% of players who successfully completed
> all modes" at the final result screen

### 4 — Classic hint refinement

> for classic mode the next hint should always be free if they are on
> their 2nd to last guess (they can use a hint to have one guess
> remaining) and we should disable the hint button with 1 guess left

(Interpreted as: when `effectiveRemaining === 2` the next available
hint unlocks regardless of threshold. When `effectiveRemaining === 1`
the hint button renders disabled.)

### 5 — Phasing decision (via AskUserQuestion)

> Hint thresholds: **after 4 and 7 wrong guesses**
>
> Phasing: **Phase 1 now: caps + lose states + counter UI** — streak +
> stats backend in later sessions

---

## Locked decisions

### Per-mode caps

| Mode    | Cap | Information curve at the cap                              | Notes                                                          |
| ------- | --: | --------------------------------------------------------- | -------------------------------------------------------------- |
| Classic |   8 | 8 attribute tiles per guess, no ramp                      | 2 hints unlock at 4 & 7 wrong; each consumes a slot            |
| Sound   |   8 | Linear audio ramp; full clip at guess 7                   | Skip turn counts toward cap (`SKIP_MARKER` in `guesses[]`)     |
| Quote   |   8 | Discrete audio unlocks at guess 5 (line 1) and 7 (line 2) | 2 speakers to find; no more audio after 7                      |
| Ability |  12 | 4×4 tile reveal grid + per-day rotation                   | At cap, 4 tiles still hidden + rotation still applied          |
| Splash  |   5 | 9-step zoom curve calibrated for "guess 8 = full reveal"  | Player only ever sees indices 0–4; curve is intentionally tight |

### Streak rules

- **Engagement-based, not correctness-based.** A day "counts" if every
  built mode is finished — won, lost, OR (legacy) gaveUp.
- **One streak**, shared across all modes (not per-mode).
- **Streak breaks on missed days only.** Losing modes doesn't break it.
- **Backfill from history**: on first read after the feature lands,
  walk existing `owdle.<mode>.<day>` localStorage keys to derive both
  `current` and `longest` so pre-existing players get credit.
- **2:15am Pacific** day rollover (already wired via `lib/daily.ts`
  `dayString()`).

### UX rules

- **Guesses-remaining counter** is "minimal but prominent". Pip strip +
  large tabular number. Color escalates: info (>50%) → partial (yellow,
  ≤50%) → wrong (red, =1).
- **Lose state** auto-reveals the answer in a muted card with light red
  wash, "Better luck tomorrow" eyebrow, and the `NextModeCTA` to keep
  the player moving forward.
- **Score in header**: `HeaderProgress` dots become tri-state — green
  (won) / red (lost) / line (open). Compact "X / N" readout counts both
  wins and losses as "done".

---

## Phase 1 — Caps, lose states, counter UI [IMPLEMENTED, uncommitted]

### New files

- `lib/streak.ts` — _(actually shipped in Phase 2)_
- `components/GuessRemaining.tsx` — color-shifting pip + tabular number
- `components/LossReveal.tsx` — shared muted-red card with eyebrow +
  caller-supplied answer slot + `NextModeCTA`

### Storage changes (`lib/storage.ts`)

```ts
export type ModeState = {
  day: string;
  guesses: string[];
  won: boolean;
  lost?: boolean;       // NEW — cap hit without solving
  gaveUp?: boolean;     // legacy Sound "Show answer"; treated like `lost`
  hintsUsed?: string[]; // NEW — Classic-only; attribute keys revealed
  bonus?: { selected: number; correct: boolean | null };
};

export type ConversationState = {
  day: string;
  speakers?: [string, string];
  guesses: ConversationGuess[];
  won: boolean;
  lost?: boolean;       // NEW
};
```

`loadModeState` and `loadConversationState` were updated to surface
`lost` and `hintsUsed` from JSON.

### Per-mode edits

- `components/ClassicGame.tsx` — `MAX_GUESSES = 8`,
  `HINT_UNLOCK_AT = [4, 7]`, hint costs a slot, **safety rescue:** next
  hint unlocks when `effectiveRemaining === 2` (regardless of
  threshold), button disabled when `effectiveRemaining <= 1`. Native
  `window.confirm()` before consuming a hint. Revealed attributes pinned
  as chips above the input.
- `components/SoundGame.tsx` — `MAX_GUESSES = 8`,
  `FULL_AUDIO_AT = MAX_GUESSES - 1 = 7`,
  `snippetDurationFor` uses `(guessCount + 1) / MAX_GUESSES`. Removed
  the old user-controlled "Show answer" button; auto-loss at cap.
- `components/QuoteGame.tsx` — `MAX_GUESSES = 8`,
  `audioUnlockedCount` is discrete: 0 → 5 wrong → line 1 → 7 wrong →
  line 2. No further unlocks for longer conversations.
- `components/AbilityGame.tsx` — `MAX_GUESSES = 12`. On end (win or
  loss), `cellsRevealed = TOTAL_CELLS` and `rotation = 0` so the icon
  is readable.
- `components/SplashGame.tsx` — `MAX_GUESSES = 5`. New
  `ZOOM_BY_GUESS = [20, 12, 7, 4, 2.5, 1.8, 1.4, 1.15, 1]` (9 entries,
  full reveal at index 8). Player only ever sees indices 0–4.

### Score reflection

- `components/HeaderProgress.tsx` — tri-state dots; `wonCount` and
  `lostCount` summed for the `X / N` readout; tooltip
  `"W won · L lost · O left"`.
- `components/HomeContent.tsx` — `Status` type gained `lost`. Mode card
  tags now have a `✕ Missed` red branch in addition to `✓ in N` (won)
  and `Revealed` (legacy). `allDone` now means "every mode finished"
  (won + lost + gaveUp). `DailyCompleteHero` got `wonCount` +
  `lostCount` props and two copy variants:
  - **Sweep:** "You swept all N modes today in M total guesses."
  - **Mixed:** "You finished today's set — X won, Y missed, M guesses
    total."
- `components/NextModeCTA.tsx` — now treats `lost` as done for
  cross-mode routing.

### Side-quest fixes baked into Phase 1

These came up during Phase 1 and are worth knowing about:

1. **Splash mode didn't render in prod or in dev with `MEDIA_BASE` set.**
   `lib/media.ts` was unconditionally rewriting every relative path to
   `https://media.playowdle.com`. Splash files (`/splash/tracer.jpg`)
   are Pages-served, not R2. Fix: whitelist `R2_PREFIXES = ["/sounds/",
   "/maps/", "/skins/", "/voicelines/", "/banners/"]` (matching
   `scripts/sync-to-r2.mjs`'s `SYNC_DIRS`); paths outside those return
   as-is.
2. **Hint button copy "Hint (2 left)" was confusable with "2 guesses
   left".** Switched to `Hint ×2 · costs a guess` notation. Bumped
   `GuessRemaining`'s number to `font-display text-2xl sm:text-3xl
   font-bold` so it dominates the row.
3. **Win/loss cards rendered skewed against `max-w-6xl` page.** The
   wide `DailyCompletePanel` inside `NextModeCTA` made the
   portrait+text+CTA flex-row layout collapse left. Restructure: card
   wrapped in `mx-auto max-w-md`, portrait+headline stacked above
   `NextModeCTA` instead of beside it. Tighter padding (`p-4 sm:p-5`).
4. **Nested green-on-green.** Stripped the inner
   `border-2 border-correct bg-correct/10` from `DailyCompletePanel`
   since it's always nested inside a green win card (or red
   `LossReveal`). Reduced stat numbers (`text-2xl sm:text-3xl`),
   countdown (`text-3xl sm:text-4xl`), section padding (`py-3`).
5. **`TryDeadlockleCard` was huge in the narrow nested context.**
   Added a `compact` prop. Compact variant uses smaller padding,
   stacked layout, condensed copy. Default unchanged for home page.
6. **Winning `GuessRow` outline overlapped neighbors.** The `-m-1`
   negative margin shrank the `space-y-4` gap and made the green
   outline visually crowd the green win card above. Fix: use
   `outline-offset-2` with no padding/margin trick.

---

## Phase 2 — Streak system port from Deadlockle [IMPLEMENTED, uncommitted]

### New files

- `lib/streak.ts` — single-key state with `current`, `longest`,
  `lastCompletedDay`. `bumpStreakIfNeeded()` is idempotent (safe to
  call from multiple consumers per render). `backfillFromHistory()`
  + `consecutiveEndingAt()` + `longestRunInHistory()` derive both
  counters from existing `owdle.<mode>.<day>` keys on first read.
- `components/StreakBadge.tsx` — `useStreak` hook subscribes to
  `feedback:refresh` (dispatched by `NextModeCTA` on every
  win/loss/give-up), `focus`, and `visibilitychange`. Three variants:
  - `"header"` — flame + tabular count, always rendered, faded "0"
    pre-streak, accent amber active. Renders an invisible placeholder
    during hydration to prevent CLS.
  - `"hero"` — bordered amber pill with `"N-day streak"` + optional
    `"Best: M"` subline. Hides when `current === 0`.
  - `"band"` — large centered flame + count between
    `border-y border-accent/25`, matches the panel's section rhythm.

### Adaptations from Deadlockle's `lib/streak.ts`

- `STREAK_KEY`: `"deadlockle.streak"` → `"owdle.streak"`
- `MODE_KEY_RE`: `/^deadlockle\./` → `/^owdle\./`
- `isDayComplete` per-key prefix: `deadlockle.${slug}` →
  `owdle.${slug}`
- `isDayComplete` check: Deadlockle only checks `won || gaveUp`;
  OWdle adds `lost` per the Phase 1 rules.

### Wiring

- `components/HeaderProgress.tsx` — `<StreakBadge variant="header" />`
  inserted before the `X / N` readout and dots
- `components/HomeContent.tsx` — `<StreakBadge variant="hero" />`
  inside `DailyCompleteHero`, below the score copy
- `components/NextModeCTA.tsx` — `<StreakBadge variant="band" />`
  inside `DailyCompletePanel`, between the score grid and the
  "Next puzzle in" countdown

### Migration safety

- Pre-Phase-1 saves have `won === true` for solved days and no `lost`
  field for unsolved ones. `isDayComplete` matches them correctly via
  the `won` branch.
- Old Sound saves with `gaveUp: true` still count as complete via the
  `gaveUp` branch.
- Map mode is `built: false` in `lib/modes.ts` and excluded from
  `BUILT_MODE_SLUGS`, so its non-standard state shape doesn't poison
  `isDayComplete`.

---

## Phase 3 — Global player-stat infrastructure [IMPLEMENTED, uncommitted]

Originally planned around D1 tables + POST counters. Implementation
pivoted to a PostHog-HogQL-server-side architecture: events fire from
the client into the existing PostHog pipeline; the Pages Function
queries those events on demand for the user-facing % stats. No new
write path, no second source of truth, but the user-facing stats
line is gated on PostHog secrets being set in prod.

### 3a — PostHog instrumentation [BUILT]

`lib/tracking.ts` exposes one helper per event. All fire on the client
through the existing `posthog-js` initialization in
`instrumentation-client.ts`. Per-day localStorage guards in
`alreadyFired()` keep `mode_started`, `mode_completed`, and
`daily_completed` from double-firing on remounts within a Pacific
puzzle day. `guess_submitted` and `hint_used` are unguarded — they
fire from direct user actions.

| Event             | Where it fires                                                            | Key props                                                                                                       |
| ----------------- | ------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `mode_started`    | Each game component's mount effect                                        | `mode`, `daily_id`, `answer_id`                                                                                 |
| `guess_submitted` | Inside guess-submit handler in each game                                  | `mode`, `daily_id`, `guess_number`, `is_correct`, `guess_id`, `answer_id`                                       |
| `hint_used`       | Classic hint-consume handler                                              | `mode`, `daily_id`, `hint_index`, `at_guess_number`, `attribute_revealed`                                       |
| `mode_completed`  | Each game's terminal-transition effect (won/lost)                         | `mode`, `daily_id`, `outcome`, `total_guesses`, `cap`, `hints_used`, `answer_id`, plus mode-specific extras     |
| `daily_completed` | `lib/streak.ts:bumpStreakIfNeeded` at the moment the day flips complete   | `daily_id`, `won_count`, `lost_count`, `total_guesses`, `streak_current`, `streak_longest`, `sweep`             |

PostHog `site` super-property (`"owdle"`) is set in
`instrumentation-client.ts` so the shared DailyDles project can split
OWdle from Deadlockle events.

### 3b — Server-side aggregator [BUILT]

`functions/api/stats/today.ts` is the only stats endpoint. Request
flow:

1. Validate `?day=YYYY-MM-DD` shape (regex guard prevents HogQL
   injection).
2. Return cached payload if the day's still in the 5-min in-isolate
   cache.
3. If `POSTHOG_PERSONAL_API_KEY` or `POSTHOG_PROJECT_ID` are missing,
   return empty buckets at HTTP 200. Graceful degradation: the UI
   hides cleanly when secrets aren't set on a preview deploy or in
   local Pages dev.
4. Otherwise run two HogQL queries in parallel:
   - Per-mode `count(DISTINCT distinct_id)` grouped by mode + outcome.
   - Daily `count(DISTINCT distinct_id)` for finishers and sweepers.
5. Cache the merged payload; return with
   `Cache-Control: public, max-age=60, s-maxage=300`.

Three cache layers stack: per-tab client (in `lib/stats.ts`),
per-isolate 5-min in-memory, plus the CDN max-age. Combined staleness
ceiling is ~5 min.

### 3c — Client wrapper + UI surface [BUILT]

- `lib/stats.ts:useDailyStats()` — hook fetches `/api/stats/today`
  once per page load, caches per-tab.
- `lib/stats.ts:modeWinPercent / dailySweepPercent` — accessors that
  return null when the bucket count is below `MIN_SAMPLE`.
- `components/ModeStatsLine.tsx` — muted gray "X% solved today's
  <Mode>" rendered on every per-mode result card (both win + loss).
- `components/DailyStatsBand.tsx` — single-line band on
  `DailyCompletePanel` showing sweep-rate among finishers,
  personalized by whether the local player swept ("Top X% of today's
  finishers" vs "X% of finishers swept today").

### 3d — Locked decisions (from grilling session 2026-05-22)

- **Architecture**: PostHog HogQL ratified over the original D1
  plan. Zero new infra, no second source of truth, `distinct_id`
  dedup is good enough at current DAU.
- **Dedup unit**: `distinct_id` (PostHog anonymous cookie). The
  plan's original "discuss before shipping" item is resolved
  — ratified. Trade-off: same user on phone + laptop counts twice,
  but a NAT'd household no longer collapses to one player (which
  per-IP would have done).
- **Display threshold**: `MIN_SAMPLE` lowered from 25 → 10. At ~36
  peak DAU, 25 hid the stat for most of the day; 10 is noisier
  (±~20pp at n=10) but visible by mid-morning.
- **Copy bands**: The plan's original 4-band color/copy scheme
  (red/orange/green/bright) is dropped. Per-mode lines stay muted
  gray with a single uniform copy variant. Difficulty framing
  moves to the daily tier (Phase 3.5).
- **Daily stat surface**: BOTH finish-rate and sweep-rate to be
  shown on `DailyCompletePanel`. Sweep-rate is current; finish-rate
  is open work in 3e below.
- **Backfill**: Pre-Phase-3 plays show "no data yet" via empty
  buckets. No synthesis needed.
- **Cache strategy**: 5-min server-side + `max-age=60`,
  `s-maxage=300` CDN + per-tab client. Sufficient.

### 3e — Remaining work to ship Phase 3

1. **Lower `MIN_SAMPLE`** in `lib/stats.ts` from 25 to 10.
2. **Add finish-rate stat** to `/api/stats/today`. Extra HogQL
   query — denom is `count(DISTINCT distinct_id)` over players who
   fired `mode_started` for at least 2 distinct modes on the
   requested day. The numerator reuses the existing
   `daily.finishers`. Surface in the response under
   `daily.starters_ge2` (or similar) and compute
   `finishers / starters_ge2` on the client.
3. **Render finish-rate line** in `DailyStatsBand` above the
   existing sweep-rate line. Copy: "<X>% of starters finished
   today's set". Hide when `starters_ge2 < MIN_SAMPLE`.
4. **Confirm prod env vars**: `POSTHOG_PERSONAL_API_KEY` +
   `POSTHOG_PROJECT_ID` set on the Pages project. Without them
   the stats line hides; with them it renders.

---

## Phase 3.5 — Daily tier system [TODO]

Overwatch-tier badge on `DailyCompletePanel` summarizing the player's
day. Replaces the rejected 4-band copy variation idea with a richer
9-tier ranking that doubles as the share-worthy headline result.

### 3.5a — Tier basis

- **What's ranked**: the player's individual daily performance
  composite (formula deferred to taxonomy pass).
- **Comparison group**: today's finishers only (live, per-day —
  NOT rolling 30-day).
- **Tiers**: T500, Champion, Grandmaster, Master, Diamond,
  Platinum, Gold, Silver, Bronze (9 tiers, matching Overwatch
  competitive).
- **Display threshold**: only render the badge when today's
  finishers > 9.
- **Update behavior**: promote-only ratchet. Cache the player's
  highest-seen tier for the day in localStorage; refresh upward as
  more finishers reveal a better percentile, never downward.

### 3.5b — Rendering

- Where: inside `DailyCompletePanel`
  (`components/NextModeCTA.tsx:DailyCompletePanel`), near the
  existing score band. Exact placement TBD during visual pass.
- Scope: per-day overall only — NOT on per-mode result cards.
- Per-mode cards keep `ModeStatsLine` as the muted "X% solved
  today's Mode" line. No tier badge there.

### 3.5c — Open taxonomy (deferred)

- **Composite score formula** (combines 5 mode results into one
  number). Tentative shape:
  - Per-mode score: `won ? (cap - guesses) / cap : 0`.
  - Daily composite: sum or weighted average of the per-mode scores.
- **Loss handling** in the composite (penalty vs zero contribution).
- **Exact percentile cutoffs** for each tier. Initial sketch:
  T500 top 1%, Champion top 5%, GM top 10%, Master top 25%,
  Diamond top 40%, Plat top 60%, Gold top 80%, Silver top 95%,
  Bronze remainder.
- **Visual treatment**: icon vs text-only vs colored pill.
  Overwatch rank icons have unclear usage rights; safer to build
  text/color badges in the OWdle palette.
- **Backend shape**: needs a new HogQL query returning today's
  finisher composite distribution. The client locates its own
  composite within that distribution to derive the tier.

### 3.5d — Implementation order

1. Lock composite formula on paper (taxonomy pass).
2. Build the percentile-fetch endpoint (extend
   `/api/stats/today` or add `/api/stats/today-distribution`).
3. Build `DailyTierBadge` component with promote-only
   localStorage cache (key suggestion: `owdle.tier.<YYYY-MM-DD>`,
   value = highest tier seen).
4. Wire into `DailyCompletePanel`.
5. Iterate tier cutoffs after 1–2 weeks of data.

---

## Phase 4 — Cap tuning [deferred]

The Phase 1 caps (Classic 8 / Sound 8 / Quote 8 / Ability 12 /
Splash 5) are explicit guesses. Once Phase 3 stats are live and a
few weeks of data exist, revisit each cap:

- **Splash**: plan note says "might be too hard". Watch win rate;
  if consistently low, raise cap (extends visible zoom steps from
  the curve's tail).
- **Ability**: plan note says "Watch analytics to see if users
  find it too easy". If win rate runs consistently high, drop cap.
- **Quote**: plan note flags "might be too easy" with audio at 5
  and 7. If win rate runs high, push audio unlocks back or remove
  the second unlock.

Exact thresholds, criteria, and cadence to be decided when data
exists. Deliberately not codifying ahead of data per the grilling
session decision.

---

## Phase 5 — Cross-device sync [parked, pending auth]

Current limitation: per-mode state and the streak both live in this
browser's localStorage. A player who solves some modes on phone and
others on laptop:

- Sees independent per-device "did I finish today?" — each device
  shows that day as incomplete.
- Sees their streak break, even though they finished every mode
  across the two devices.

Structurally hard to fix without an account/auth layer. PostHog's
`distinct_id` is per-device, so it doesn't unify either.

Parked until/unless OWdle introduces account creation. When that
happens, both the streak and the daily-completion check need to be
re-rooted on the user identity rather than localStorage.

---

## Implementation reference

### Project anchors

- **Main project**: `/Users/yush/Documents/Projects/OWdle/`
- **Sister project (reference for streak port)**:
  `/Users/yush/Documents/Projects/Deadlockle/`
- **Conventions doc**: `AGENTS.md` (READ FIRST — Next 16 has breaking
  changes; R2 media split; how `npm run dev` orchestrates 4 servers;
  internal `/labeler/` routes 404 in prod)
- **Live site**: https://playowdle.com
- **Sister site**: https://deadlockle.com

### Storage keys

- `owdle.<mode>.<YYYY-MM-DD>` — per-mode per-day game state
  (`ModeState` for classic/sound/ability/splash, `ConversationState`
  for quote, `MapState` for map)
- `owdle.streak` — `{current, longest, lastCompletedDay}`
- `owdle.map.feedback.v1` — spot-feedback for Map mode (separate
  feature)
- `owdle:ability:hardMode` — per-user toggle for Ability rotation

### Key utilities

- `lib/daily.ts:dayString()` — Pacific-anchored YYYY-MM-DD (2:15am
  rollover, DST-aware via `Intl`)
- `lib/modes.ts:BUILT_MODE_SLUGS` — `["classic", "quote", "ability",
  "splash", "sound"]` (map excluded)
- `lib/storage.ts:loadModeState / saveModeState` — generic
  per-mode-per-day storage
- `lib/streak.ts:bumpStreakIfNeeded()` — idempotent streak tick
- `lib/media.ts:media(path)` — R2/Pages-aware URL resolver (see
  Phase 1 side-quest #1 for the gotcha)
- `lib/compare.ts:ATTRIBUTES / compareHero / AttrResult` — the
  Classic / Quote tile comparison engine
- `lib/tracking.ts` — PostHog event helpers (`trackModeStarted`,
  `trackGuessSubmitted`, `trackHintUsed`, `trackModeCompleted`,
  `trackDailyCompleted`); per-day localStorage guards via
  `alreadyFired()` keep terminal events from double-firing
- `lib/stats.ts:useDailyStats / modeWinPercent / dailySweepPercent`
  — client wrapper for `/api/stats/today`; `MIN_SAMPLE` gates the
  display threshold (currently 25, dropping to 10 per Phase 3e)
- `functions/api/stats/today.ts` — Pages Function that queries
  PostHog HogQL server-side and returns merged mode + daily buckets;
  gated on `POSTHOG_PERSONAL_API_KEY` + `POSTHOG_PROJECT_ID`

### Build + run

```bash
# Type-check only (fast)
npx tsc --noEmit

# Full static build (Next 16 export to out/)
npm run build

# Local dev with all servers
npm run dev
# Just next, no admin servers:
npm run dev:next

# Production deploy chain
npm run deploy:live
# = sync-to-r2 && build-for-deploy && wrangler pages deploy && git push
```

Note from memory: use `NPM_CONFIG_CACHE=/tmp/owdle-npm-cache` when
running npm — the global cache has root-owned files.

### Memory worth knowing

These were stored to auto-memory during the original audit + earlier
work. A fresh Claude Code conversation should consult them when
relevant:

- **Em dashes sparse in copy.** Don't dump em dashes into UI strings;
  middot or just rephrasing is preferred. (Stored as
  `feedback_copy_em_dashes`.)
- **Brand alternateName trap.** Never list competitor brand names in
  JSON-LD `alternateName` or "also known as" copy — Google starts
  conflating you. (Stored as `feedback_brand_alternatename_trap`.)
- **Deploy workflow.** When Yash says "deploy", run the full
  commit + build + wrangler + push end-to-end without confirmation.
  (Stored as `feedback_deploy_workflow`.)
- **OWdle internal-route gating.** `/labeler/` uses
  `NODE_ENV !== "production"` + `notFound()` to 404 in prod. Mirror
  this for any new internal route. (Stored as
  `project_owdle_internal_routes`.)
- **Daily reset @ 2:15am PT.** Both OWdle and Deadlockle roll over at
  2:15am Pacific. Copy says "2:15am Pacific", never "midnight UTC".
  (Stored as `project_daily_reset`.)

### PostHog context

- Project: "DailyDles" (id `433581`) in org "YushDailyDles"
  (id `019e4779-7909-0000-e4d1-e9456ca2b0a1`)
- Both OWdle and Deadlockle data live here, distinguished by the
  `site` super-property (`"owdle"` vs `"deadlockle"`)
- Reverse-proxied through `/ingest` (see `functions/ingest/`)
- Today: ~189 mode pageviews over the last 30 days, ~36 DAU peak.
  Sample size will grow once Phase 3 events ship.

### Where the existing votes/feedback infra lives

Use these as the reference for Phase 3 endpoints:

- `functions/votes/` — Pages Functions D1 handlers
- `db/` — SQL migrations
- `scripts/votes-admin-server.mjs` — local admin server, started by
  `npm run dev` on `:8788`
- `components/RequestNextGame.tsx` — client integration (search, vote,
  leaderboard)

The Phase 3 stats endpoints can follow the same pattern: function file
in `functions/stats/`, migration in `db/`, client wrapper in the
relevant card components.
