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
