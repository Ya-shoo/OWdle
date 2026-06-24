// Volume preference is global (one knob across all sound playback) and
// stored under a single localStorage key so it carries across days,
// reloads, and any future audio-bearing modes.
const VOLUME_KEY = "owdle.volume";

// User-facing scale: 0..1, presented to the player as 0%–100%.
// Mapped to a Web Audio GainNode multiplier where 100% = MAX_GAIN.
// Default volume of 0.75 → gain 1.5 — a noticeable bump above the
// unboosted source clip without saturating typical ability sounds.
export const DEFAULT_VOLUME = 0.75;
export const MAX_GAIN = 2.0;

export function loadVolume(): number {
  if (typeof window === "undefined") return DEFAULT_VOLUME;
  try {
    const raw = window.localStorage.getItem(VOLUME_KEY);
    if (raw === null) return DEFAULT_VOLUME;
    const v = Number(raw);
    if (!Number.isFinite(v)) return DEFAULT_VOLUME;
    return Math.max(0, Math.min(1, v));
  } catch {
    return DEFAULT_VOLUME;
  }
}

export function saveVolume(v: number): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(VOLUME_KEY, String(v));
  } catch {
    // ignore quota / serialization errors
  }
}

export function gainFromVolume(v: number): number {
  return Math.max(0, Math.min(1, v)) * MAX_GAIN;
}

// Per-role gain multiplier applied on top of the user's volume setting.
// Support and tank clips in our set are mastered noticeably quieter than
// damage gunshots, so we lift them so a player at default volume hears them
// clearly. Playback rides an HTMLAudioElement / <video> whose `volume` is
// clamped to [0, 1] (see WaveformPlayer), so a boost can't amplify past a
// clip's native level — it just lets the clip reach that level instead of
// sitting at the default 75%. There's no >1 gain and thus no clipping risk,
// which is why lifting these is safe.
export const ROLE_AUDIO_BOOST: Record<"tank" | "damage" | "support", number> = {
  tank: 1.6,
  damage: 1,
  support: 1.6,
};

// Per-hero overrides, taking precedence over the role boost for the rare
// hero whose specific clips are quieter than its role peers — e.g. Shion's
// custom anime SFX, which are damage-role but mastered low. Keyed by hero.key.
export const HERO_AUDIO_BOOST: Record<string, number> = {
  shion: 1.6,
};

// Resolve the gain boost for a hero: an explicit per-hero override wins,
// otherwise fall back to the role default.
export function audioBoostFor(hero: {
  key: string;
  role: "tank" | "damage" | "support";
}): number {
  return HERO_AUDIO_BOOST[hero.key] ?? ROLE_AUDIO_BOOST[hero.role];
}
