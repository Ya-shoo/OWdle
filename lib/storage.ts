// localStorage-backed game state per mode + day. A finished puzzle persists
// across reloads but resets at 2:15am Pacific when the day key changes.

export type ModeState = {
  day: string;
  guesses: string[]; // hero keys, in order
  won: boolean;
  // Sound mode only: player tapped "Show answer" after running out of
  // ideas. Treated like winning for reveal/UI purposes but doesn't count
  // as a solve in shares.
  gaveUp?: boolean;
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

export function loadModeState(mode: string, day: string): ModeState {
  if (typeof window === "undefined") return { day, guesses: [], won: false };
  try {
    const raw = window.localStorage.getItem(key(mode, day));
    if (!raw) return { day, guesses: [], won: false };
    const parsed = JSON.parse(raw) as ModeState;
    if (parsed.day !== day) return { day, guesses: [], won: false };
    return parsed;
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
    return parsed as ConversationState;
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
