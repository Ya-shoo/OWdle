// localStorage-backed game state per mode + day. A finished puzzle persists
// across reloads but resets at 2:15am Pacific when the day key changes.

export type ModeState = {
  day: string;
  guesses: string[]; // hero keys, in order
  won: boolean;
  // Player ran out of guesses without solving. Triggered automatically
  // when guesses.length (+ hintsUsed.length for Classic) hits the
  // per-mode cap. Mutually exclusive with `won`; both render reveal
  // states but the lose state uses the muted "Better luck tomorrow"
  // card. Counted toward streak/daily-complete as engagement.
  lost?: boolean;
  // Legacy Sound mode: player tapped "Show answer" after running out
  // of ideas. As of the hard-cap rollout this code path is unused —
  // Sound auto-loses at the cap instead — but the field stays for
  // backward compatibility with players who gave up under the old
  // build. Reveal UI treats `gaveUp` identically to `lost`.
  gaveUp?: boolean;
  // Classic mode only: attribute keys revealed via the hint system.
  // Each entry consumes one guess slot (so effective guess count is
  // guesses.length + hintsUsed.length against the cap).
  hintsUsed?: string[];
  // Parallel to hintsUsed[]: the wrong-guess count at the moment each
  // hint was revealed. Lets the guess history interleave hint rows
  // between real guesses so the timeline reads chronologically after a
  // reload. Pre-Phase-3 saves omit this; the renderer falls back to
  // appending hints at the end of the timeline.
  hintOrder?: number[];
  // Sound mode bonus round: which ability did the player pick after winning?
  // Optional; only Sound mode reads/writes this.
  bonus?: {
    selected: number; // index into hero.abilities[]
    correct: boolean | null; // null when the clip wasn't labeled
  };
};

function key(mode: string, day: string): string {
  return `owdle.${mode}.${day}`;
}

// Reconcile a loaded `hintOrder` against its `hintsUsed`. Two failure
// modes to fix:
//   1. Legacy state has hintsUsed without hintOrder — synthesize a 0
//      for each entry so the timeline can still place them (bottom of
//      the reversed display, the safest fallback when we don't know
//      their original chronological position).
//   2. Mixed legacy + new (hintsUsed grew while hintOrder was undefined
//      between writes) — pad leading positions with 0 so the new
//      entries land in their *correct* slots and the legacy ones
//      cluster at the bottom.
// Returns undefined when there are no hints at all so we don't write
// an empty array back to storage on the next persist.
function normalizeHintOrder(
  rawHintsUsed: unknown,
  rawHintOrder: unknown,
): number[] | undefined {
  const hintCount = Array.isArray(rawHintsUsed) ? rawHintsUsed.length : 0;
  if (hintCount === 0) return undefined;
  const validOrder =
    Array.isArray(rawHintOrder) &&
    rawHintOrder.every((n: unknown) => typeof n === "number")
      ? (rawHintOrder as number[])
      : [];
  if (validOrder.length === hintCount) return validOrder;
  if (validOrder.length > hintCount) return validOrder.slice(0, hintCount);
  // Pad with leading 0s — legacy entries come *first* in chronology
  // (they were saved earlier), and 0 places them at the start.
  return [
    ...new Array(hintCount - validOrder.length).fill(0),
    ...validOrder,
  ];
}

export function loadModeState(mode: string, day: string): ModeState {
  if (typeof window === "undefined") return { day, guesses: [], won: false };
  try {
    const raw = window.localStorage.getItem(key(mode, day));
    if (!raw) return { day, guesses: [], won: false };
    const parsed = JSON.parse(raw) as Partial<ModeState> & { day?: string };
    if (parsed.day !== day) return { day, guesses: [], won: false };
    // Newer modes (map) store a different schema (rounds[] instead of
    // guesses[]). Coerce so legacy home-screen consumers reading
    // st.guesses.length / st.won don't throw or report stale data.
    const asMap = parsed as Partial<MapState>;
    const isMapShape =
      Array.isArray(asMap.spotIds) && Array.isArray(asMap.rounds);
    const derivedGuesses = isMapShape
      ? // Each completed round counts as one guess for dashboard
        // purposes; the home-page progress UI just needs a count.
        (asMap.rounds ?? []).map((_, i) => String(i))
      : Array.isArray(parsed.guesses)
        ? parsed.guesses
        : [];
    const derivedWon =
      parsed.won === true ||
      (isMapShape &&
        (asMap.spotIds?.length ?? 0) > 0 &&
        (asMap.currentRound ?? 0) >= (asMap.spotIds?.length ?? 0));
    return {
      day: parsed.day,
      guesses: derivedGuesses,
      won: derivedWon,
      lost: parsed.lost,
      gaveUp: parsed.gaveUp,
      hintsUsed: Array.isArray(parsed.hintsUsed) ? parsed.hintsUsed : undefined,
      hintOrder: normalizeHintOrder(parsed.hintsUsed, parsed.hintOrder),
      bonus: parsed.bonus,
    };
  } catch {
    return { day, guesses: [], won: false };
  }
}

export function saveModeState(mode: string, state: ModeState): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key(mode, state.day), JSON.stringify(state));
  } catch {
    // ignore quota / serialization errors
  }
}

// --- Backwards-compatible aliases for classic mode ---
export type ClassicState = ModeState;

export const loadClassic = (day: string): ClassicState =>
  loadModeState("classic", day);
export const saveClassic = (state: ClassicState): void =>
  saveModeState("classic", state);

// --- Conversation mode (Quote): each guess targets a specific speaker ---

export type ConversationGuess = {
  heroKey: string;
  target: 0 | 1; // which of the two speakers this guess is for
};

export type ConversationState = {
  day: string;
  // Speaker keys for the conversation this state is for. Lets the loader
  // detect when the daily pick has rotated under saved progress.
  speakers?: [string, string];
  guesses: ConversationGuess[];
  won: boolean;
  // Same semantics as ModeState.lost — cap hit without solving both
  // speakers. Reveal uses the muted "Better luck tomorrow" card.
  lost?: boolean;
};

function isValidConversationGuess(g: unknown): g is ConversationGuess {
  return (
    typeof g === "object" &&
    g !== null &&
    typeof (g as ConversationGuess).heroKey === "string" &&
    ((g as ConversationGuess).target === 0 ||
      (g as ConversationGuess).target === 1)
  );
}

export function loadConversationState(day: string): ConversationState {
  if (typeof window === "undefined") return { day, guesses: [], won: false };
  try {
    const raw = window.localStorage.getItem(key("quote", day));
    if (!raw) return { day, guesses: [], won: false };
    const parsed = JSON.parse(raw);
    if (parsed.day !== day) return { day, guesses: [], won: false };
    if (!Array.isArray(parsed.guesses))
      return { day, guesses: [], won: false };
    if (!parsed.guesses.every(isValidConversationGuess))
      return { day, guesses: [], won: false };
    return {
      ...(parsed as ConversationState),
      lost: parsed.lost === true ? true : undefined,
    };
  } catch {
    return { day, guesses: [], won: false };
  }
}

export function saveConversationState(state: ConversationState): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      key("quote", state.day),
      JSON.stringify(state),
    );
  } catch {
    // ignore
  }
}

// --- Map mode: 5 rounds of GeoGuessr-style guessing per day ---
// Each round records the first guess (which map, where on it) plus an
// optional second guess that fires automatically when the player picked
// the wrong map. Stored separately from ModeState because the legacy
// "guesses: string[]" shape doesn't accommodate per-round state.

export type MapRoundGuess = {
  // The map key the player picked from the dropdown.
  guessedMap: string;
  // Pixel position they pinned on that map's overhead. Stored relative
  // to the overhead's natural dimensions, so it's resolution-stable.
  guessedPx: [number, number];
};

export type MapRoundResult = {
  spotId: string;
  mapKey: string;
  // First guess. If guessedMap matches the spot's mapKey, scoring uses
  // this directly. If not, the player gets a forced second guess on the
  // correct map (see secondGuess below).
  firstGuess: MapRoundGuess | null;
  // Only present when the first guess was on the wrong map. The map is
  // auto-set to the correct one; only the pin position is the player's
  // choice. Distance points are halved and the map bonus is forfeited.
  secondGuess: MapRoundGuess | null;
  // Final scored breakdown, computed when the round resolves.
  pointsMap: number; // 0 or 1000
  pointsDistance: number; // 0–4000
  pointsTotal: number;
  // Convenience flags for the UI / share card.
  wrongMapFirst: boolean;
  skipped: boolean;
};

export type MapState = {
  day: string;
  // Spot IDs in play order — we lock the picks at first load so a mid-
  // day reload doesn't reshuffle if the spots.json grew.
  spotIds: string[];
  rounds: MapRoundResult[];
  // 0..rounds.length, where rounds.length == picks.length means done.
  currentRound: number;
};

const EMPTY_MAP_STATE = (day: string): MapState => ({
  day,
  spotIds: [],
  rounds: [],
  currentRound: 0,
});

export function loadMapState(day: string): MapState {
  if (typeof window === "undefined") return EMPTY_MAP_STATE(day);
  try {
    const raw = window.localStorage.getItem(key("map", day));
    if (!raw) return EMPTY_MAP_STATE(day);
    const parsed = JSON.parse(raw) as MapState;
    if (parsed.day !== day) return EMPTY_MAP_STATE(day);
    if (!Array.isArray(parsed.spotIds) || !Array.isArray(parsed.rounds)) {
      return EMPTY_MAP_STATE(day);
    }
    return parsed;
  } catch {
    return EMPTY_MAP_STATE(day);
  }
}

export function saveMapState(state: MapState): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      key("map", state.day),
      JSON.stringify(state),
    );
  } catch {
    // ignore
  }
}

// --- Map mode: player-submitted spot corrections ---
// Quick-tap feedback per spot. Two signals collected at the round-
// result reveal:
//   - difficulty: how hard the player found this POV. Aggregated
//     across users to bucket spots into easy/normal/hard later and
//     tune the daily mix.
//   - pinAccurate: does the stored answer pin actually match where
//     the screenshot was taken? Spots that many users flag as off get
//     surfaced for review.
//
// Stored keyed by spotId so the latest rating wins per spot (player
// can change their mind). When we ship a backend, every click here
// also gets POSTed; the local store is currently the only source.
//
// Replaces the older free-form "report wrong location" flow — we
// gain coverage (more users will tap one of seven buttons than fill
// out a free-form form) at the cost of granularity. The accuracy
// flag is binary; the difficulty bucket is coarse. Both are enough
// to flag spots for human review without per-user manual triage.

export type SpotDifficulty = "easy" | "normal" | "hard";

export type SpotFeedback = {
  spotId: string;
  spotMapKey: string;
  difficulty?: SpotDifficulty;
  pinAccurate?: boolean;
  // Last touch time. Bumped on every patch so we can prune stale
  // entries if the store grows unwieldy.
  updatedAt: string;
};

const FEEDBACK_KEY = "owdle.map.feedback.v1";

type FeedbackStore = Record<string, SpotFeedback>;

export function loadMapFeedback(): FeedbackStore {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(FEEDBACK_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return {};
    return parsed as FeedbackStore;
  } catch {
    return {};
  }
}

export function getSpotFeedback(spotId: string): SpotFeedback | null {
  return loadMapFeedback()[spotId] ?? null;
}

/**
 * Merge a patch into the spot's stored feedback. Pass `undefined`
 * for a field to clear it (e.g. "I clicked the wrong difficulty,
 * unset it"). Returns the new merged record.
 */
export function updateSpotFeedback(
  spotId: string,
  spotMapKey: string,
  patch: { difficulty?: SpotDifficulty; pinAccurate?: boolean },
): SpotFeedback {
  const store = loadMapFeedback();
  const existing: SpotFeedback = store[spotId] ?? {
    spotId,
    spotMapKey,
    updatedAt: new Date().toISOString(),
  };
  const next: SpotFeedback = {
    ...existing,
    spotMapKey, // keep in sync if the spot's map changed since
    ...patch,
    updatedAt: new Date().toISOString(),
  };
  store[spotId] = next;
  if (typeof window !== "undefined") {
    try {
      window.localStorage.setItem(FEEDBACK_KEY, JSON.stringify(store));
    } catch {
      // ignore quota / serialization
    }
  }
  return next;
}
