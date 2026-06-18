import {
  ANSWER_POOL,
  HEROES_BY_KEY,
  type Ability,
  type Hero,
  type Skin,
} from "./heroes";
import { CONVERSATIONS, type Conversation } from "./conversations";
import {
  usesBag,
  bagClassicHero,
  bagAbilityPick,
  bagSplashPick,
  bagSoundPick,
  bagQuoteConversation,
} from "./dailyBag";
import sfxData from "@/data/sfx.json";
import soundClipsData from "@/data/sound-clips.json";
import iconOverridesData from "@/data/sound-clip-icons.json";
import soundClipTrimsData from "@/data/sound-clip-trims.json";
import spotsData from "@/data/spots.json";

type SfxEntry = {
  url: string;
  duration: number | null;
  ability_index: number | null;
};
const SFX = sfxData as Record<string, SfxEntry[]>;

type SoundClip = {
  slug: string;
  label: string;
  audioUrl: string;
  videoUrl: string | null;
  duration: number;
};
const SOUND_CLIPS = soundClipsData as Record<string, SoundClip[]>;

// Per-clip manual trim overrides, keyed by [heroKey][slug]. When present,
// these supersede WaveformPlayer's automatic silence detection so the
// snippet ladder lines up with the actual ability cue — useful when a
// clip has noisy pre-roll the silence threshold can't catch, or trailing
// tail noise we want to lop off the end. Maintained from the dev sound
// page (DevSoundTrimmer); values in seconds.
type TrimEntry = { startOffset?: number; endOffset?: number };
const SOUND_CLIP_TRIMS = soundClipTrimsData as Record<
  string,
  Record<string, TrimEntry>
>;

export function getSoundClipTrim(
  heroKey: string,
  slug: string,
): TrimEntry | null {
  return SOUND_CLIP_TRIMS[heroKey]?.[slug] ?? null;
}

// Hand-curated mapping for clip slugs whose label doesn't match a press-kit
// ability name. Outer key is hero, inner key is the clip slug, value is the
// ability slug (slugified ability name) whose icon should be borrowed for
// that clip's bonus tile. Maintained via the dev /icons page.
const ICON_OVERRIDES = iconOverridesData as Record<
  string,
  Record<string, string>
>;

// Daily puzzles roll over at 2:15am Pacific Time (America/Los_Angeles).
// DST-aware: the actual UTC moment shifts between 10:15 UTC in winter (PST,
// UTC-8) and 09:15 UTC in summer (PDT, UTC-7). All day strings and seeds
// downstream of dayString() are therefore "Pacific puzzle days," not UTC
// calendar days.
const RESET_HOUR_PT = 2;
const RESET_MIN_PT = 15;
const RESET_TZ = "America/Los_Angeles";

// Returns the Pacific puzzle-day string YYYY-MM-DD for a given Date
// (default: now). The puzzle day rolls over at 2:15am Pacific, so the
// hours between Pacific midnight and 2:15am still belong to the previous
// puzzle day.
export function dayString(d: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: RESET_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(d);
  const get = (type: string) =>
    parts.find((p) => p.type === type)?.value ?? "0";
  const y = parseInt(get("year"), 10);
  const mo = parseInt(get("month"), 10);
  const da = parseInt(get("day"), 10);
  const h = parseInt(get("hour"), 10);
  const mi = parseInt(get("minute"), 10);

  const beforeReset =
    h < RESET_HOUR_PT || (h === RESET_HOUR_PT && mi < RESET_MIN_PT);
  const dayShift = beforeReset ? -1 : 0;
  return new Date(Date.UTC(y, mo - 1, da + dayShift))
    .toISOString()
    .slice(0, 10);
}

// FNV-1a 32-bit string hash. Deterministic, fast, well-distributed enough
// to seed a daily index into the answer pool.
function fnv1a(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
  }
  return h >>> 0;
}

// Manual day -> hero pins for Classic, applied BEFORE the daily bag/hash.
// Spotlights a specific hero on a specific Pacific puzzle day (e.g. a new
// hero's launch). Only the named day is affected — the bag is not reshuffled,
// so every other day's answer is unchanged; the bag's own pick for a pinned
// day simply isn't shown that day. Key must be a valid hero key in heroes.json.
const CLASSIC_PINS: Record<string, string> = {
  "2026-06-18": "shion", // Shion launch spotlight
};

export function getHeroForDay(day: string): Hero {
  if (ANSWER_POOL.length === 0) {
    throw new Error("ANSWER_POOL is empty — check data/heroes.json");
  }
  const pinned = CLASSIC_PINS[day];
  if (pinned && HEROES_BY_KEY[pinned]) return HEROES_BY_KEY[pinned];
  if (usesBag(day)) return bagClassicHero(day);
  const idx = fnv1a(`owdle:classic:${day}`) % ANSWER_POOL.length;
  return ANSWER_POOL[idx];
}

export function todaysHero(): Hero {
  return getHeroForDay(dayString());
}

const ABILITY_POOL: Hero[] = ANSWER_POOL.filter((h) => h.abilities.length > 0);
const SPLASH_POOL: Hero[] = ANSWER_POOL.filter((h) => h.splash_url != null);
// Sound mode is backed by hero ability SFX from the
// Overwatch-Item-Tracker/sounds repo. Each hero has multiple short clips
// (gunshots, ability casts, ult cues) — no spoken voice lines.
const SOUND_POOL: Hero[] = ANSWER_POOL.filter(
  (h) => (SFX[h.key] ?? []).length > 0,
);

// Per-ability labeled clips produced by the in-house labeler tool. When
// these exist for the day's hero, they take priority over the unlabeled
// SFX dump because they have a known label, a paired MP4 for the win
// reveal, and a precise duration to drive the snippet ladder.
const LABELED_SOUND_KEYS: string[] = ANSWER_POOL.map((h) => h.key).filter(
  (k) => (SOUND_CLIPS[k] ?? []).length > 0,
);

// Conversations whose BOTH speakers are in the answer pool — guarantees
// attribute-tile comparison works for every guess.
const CONVERSATION_POOL: Conversation[] = CONVERSATIONS.filter((c) => {
  const a = HEROES_BY_KEY[c.speakers[0]];
  const b = HEROES_BY_KEY[c.speakers[1]];
  return !!a && !!b && ANSWER_POOL.includes(a) && ANSWER_POOL.includes(b);
});

export function getAbilityForDay(day: string): {
  hero: Hero;
  ability: Ability;
  abilityIndex: number;
} {
  if (ABILITY_POOL.length === 0) {
    throw new Error("ABILITY_POOL is empty");
  }
  if (usesBag(day)) {
    const { hero, abilityIndex } = bagAbilityPick(day);
    return { hero, ability: hero.abilities[abilityIndex], abilityIndex };
  }
  const heroIdx = fnv1a(`owdle:ability:${day}`) % ABILITY_POOL.length;
  const hero = ABILITY_POOL[heroIdx];
  const abIdx = fnv1a(`owdle:ability:${day}:idx`) % hero.abilities.length;
  return { hero, ability: hero.abilities[abIdx], abilityIndex: abIdx };
}

// Splash mode picks a hero and one of that hero's skin variants
// (Epic/Legendary). Since SPLASH_SKINS_ONLY_DAY (see dailyBag.ts) every
// day is a skin and the skin name doubles as the post-win bonus question;
// before that, skins were weighted ~70-80% with the default splash mixed
// in. Answer is always the hero — the skin drives the art and the bonus.
export function getSplashForDay(day: string): {
  hero: Hero;
  imageUrl: string;
  skin: Skin | null;
} {
  if (SPLASH_POOL.length === 0) {
    throw new Error("SPLASH_POOL is empty");
  }
  if (usesBag(day)) {
    const { hero, skinIndex } = bagSplashPick(day);
    if (skinIndex == null) {
      return { hero, imageUrl: hero.splash_url!, skin: null };
    }
    const skin = hero.skins[skinIndex];
    return { hero, imageUrl: skin.file, skin };
  }
  const heroIdx = fnv1a(`owdle:splash:${day}`) % SPLASH_POOL.length;
  const hero = SPLASH_POOL[heroIdx];

  const useSkin =
    hero.skins.length > 0 && fnv1a(`owdle:splash:variant:${day}`) % 100 < 70;
  if (!useSkin) {
    return { hero, imageUrl: hero.splash_url!, skin: null };
  }
  const skinIdx = fnv1a(`owdle:splash:skin:${day}`) % hero.skins.length;
  const skin = hero.skins[skinIdx];
  return { hero, imageUrl: skin.file, skin };
}

export type ResolvedSoundClip = {
  hero: Hero;
  audioUrl: string;
  videoUrl: string | null;
  label: string | null;
  slug: string | null;
  duration: number | null;
  abilityIndex: number | null;
  // Manual trim window in seconds, null when no override has been set
  // for this clip. WaveformPlayer uses these to override its auto
  // silence-skip; SoundGame uses them to size the snippet ladder so it
  // ramps to the audible portion rather than the raw file length.
  startOffset: number | null;
  endOffset: number | null;
};

export function getSoundForDay(day: string): ResolvedSoundClip {
  if (usesBag(day)) {
    const { heroKey, clipSlug } = bagSoundPick(day);
    const resolved = resolveLabeledSoundClip(heroKey, clipSlug);
    if (resolved) return resolved;
    // Fall through to legacy logic if the labeled-clip data has shifted
    // out from under the bag pool since boot (extremely rare).
  }
  // Prefer labeled clips when available — known label, paired MP4 reveal,
  // accurate duration. Fall back to the unlabeled item-tracker SFX dump
  // for heroes we haven't recorded yet, so the daily quiz keeps rotating
  // through the full roster.
  if (LABELED_SOUND_KEYS.length > 0) {
    const heroIdx =
      fnv1a(`owdle:sound:r8:${day}`) % LABELED_SOUND_KEYS.length;
    const heroKey = LABELED_SOUND_KEYS[heroIdx];
    const hero = HEROES_BY_KEY[heroKey];
    const clips = SOUND_CLIPS[heroKey];
    if (hero && clips.length > 0) {
      const clipIdx = fnv1a(`owdle:sound:r8:${day}:idx`) % clips.length;
      const clip = clips[clipIdx];
      const trim = getSoundClipTrim(heroKey, clip.slug);
      return {
        hero,
        audioUrl: clip.audioUrl,
        videoUrl: clip.videoUrl,
        label: clip.label,
        slug: clip.slug,
        duration: clip.duration,
        abilityIndex: null,
        startOffset: trim?.startOffset ?? null,
        endOffset: trim?.endOffset ?? null,
      };
    }
  }

  if (SOUND_POOL.length === 0) {
    throw new Error("SOUND_POOL is empty");
  }
  const heroIdx = fnv1a(`owdle:sound:r2:${day}`) % SOUND_POOL.length;
  const hero = SOUND_POOL[heroIdx];
  const clips = SFX[hero.key];
  const clipIdx = fnv1a(`owdle:sound:r2:${day}:idx`) % clips.length;
  const clip = clips[clipIdx];
  return {
    hero,
    audioUrl: clip.url,
    videoUrl: null,
    label: null,
    slug: null,
    duration: clip.duration,
    abilityIndex: clip.ability_index,
    startOffset: null,
    endOffset: null,
  };
}

// Lightweight reference into the labeled-clip set, used by the dev-only
// sound picker to enumerate every (hero, clip) pair without paying for
// hero portraits or ability metadata up front.
export type LabeledSoundClipRef = {
  heroKey: string;
  heroName: string;
  slug: string;
  label: string;
  duration: number;
};

export function getAllLabeledSoundClips(): LabeledSoundClipRef[] {
  const out: LabeledSoundClipRef[] = [];
  for (const heroKey of Object.keys(SOUND_CLIPS)) {
    const hero = HEROES_BY_KEY[heroKey];
    if (!hero) continue;
    for (const clip of SOUND_CLIPS[heroKey]) {
      out.push({
        heroKey,
        heroName: hero.name,
        slug: clip.slug,
        label: clip.label,
        duration: clip.duration,
      });
    }
  }
  out.sort((a, b) =>
    a.heroName === b.heroName
      ? a.label.localeCompare(b.label)
      : a.heroName.localeCompare(b.heroName),
  );
  return out;
}

export function resolveLabeledSoundClip(
  heroKey: string,
  slug: string,
): ResolvedSoundClip | null {
  const hero = HEROES_BY_KEY[heroKey];
  const clips = SOUND_CLIPS[heroKey];
  if (!hero || !clips) return null;
  const clip = clips.find((c) => c.slug === slug);
  if (!clip) return null;
  const trim = getSoundClipTrim(heroKey, slug);
  return {
    hero,
    audioUrl: clip.audioUrl,
    videoUrl: clip.videoUrl,
    label: clip.label,
    slug: clip.slug,
    duration: clip.duration,
    abilityIndex: null,
    startOffset: trim?.startOffset ?? null,
    endOffset: trim?.endOffset ?? null,
  };
}

// Bonus-round option built from a labeled clip. The label and slug come
// from sound-clips.json; the icon is best-effort matched from the hero's
// press-kit abilities by name, with overrides in sound-clip-icons.json
// for custom variants like "Scoped Fire" that don't slug-match.
export type SoundBonusOption = {
  slug: string;
  label: string;
  icon: string | null;
  isCorrect: boolean;
};

function abilityNameToSlug(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function getSoundBonusOptions(
  heroKey: string,
  correctSlug: string,
): SoundBonusOption[] {
  const hero = HEROES_BY_KEY[heroKey];
  const clips = SOUND_CLIPS[heroKey] ?? [];
  const overrides = ICON_OVERRIDES[heroKey] ?? {};
  return clips.map((clip) => {
    // Override wins when present (covers labels like "Scoped Fire" that
    // don't slugify to a real ability name). Fall back to the auto-match.
    const overrideAbilitySlug = overrides[clip.slug];
    const overrideAbility = overrideAbilitySlug
      ? hero?.abilities.find(
          (a) => abilityNameToSlug(a.name) === overrideAbilitySlug,
        )
      : undefined;
    const autoAbility = hero?.abilities.find(
      (a) => abilityNameToSlug(a.name) === clip.slug,
    );
    const ability = overrideAbility ?? autoAbility;
    return {
      slug: clip.slug,
      label: clip.label,
      icon: ability?.icon ?? null,
      isCorrect: clip.slug === correctSlug,
    };
  });
}

// Dev-only enumeration for the conversation picker. Returns the same
// filtered pool used to seed today's daily.
export function getAllConversations(): ReadonlyArray<Conversation> {
  return CONVERSATION_POOL;
}

export function getConversationForDay(day: string): {
  conversation: Conversation;
  speakers: [Hero, Hero];
} {
  if (CONVERSATION_POOL.length === 0) {
    throw new Error("CONVERSATION_POOL is empty");
  }
  if (usesBag(day)) {
    const conv = bagQuoteConversation(day);
    return {
      conversation: conv,
      speakers: [
        HEROES_BY_KEY[conv.speakers[0]]!,
        HEROES_BY_KEY[conv.speakers[1]]!,
      ],
    };
  }
  // Seed namespace bumped after expanding the conversation pool so today's
  // pick rotates to a fresh entry from the larger set.
  const idx = fnv1a(`owdle:conversation:r2:${day}`) % CONVERSATION_POOL.length;
  const conv = CONVERSATION_POOL[idx];
  return {
    conversation: conv,
    speakers: [
      HEROES_BY_KEY[conv.speakers[0]]!,
      HEROES_BY_KEY[conv.speakers[1]]!,
    ],
  };
}

// ─────────────────────────────────────────────────────────────────────────
// Map mode — pick N spots for a given day's daily run.
//
// Constraints:
//   - At most one spot per (mapKey, broad-region cluster) — we don't want
//     two near-duplicate POVs in the same day. Implemented as a min-pixel-
//     distance check between any two picks on the same map.
//   - Same seed → same picks. Day-keyed via the canonical `owdle:map:{day}`
//     namespace in the existing FNV/LCG pattern.
//   - When the answer pool is small (e.g. only one map calibrated at
//     launch), the proximity constraint is relaxed automatically — better
//     to ship 5 rounds with some clustering than to under-deliver.
// ─────────────────────────────────────────────────────────────────────────

export type MapSpot = {
  id: string;
  mapKey: string;
  worldX: number;
  worldY: number;
  worldZ: number;
  pixelX: number;
  pixelY: number;
  screenshot: string;
  capturedAt?: string;
  sourceFilename?: string;
  // Camera-facing direction at capture time. worldRot* are the raw
  // forward-vector components OCR'd from the workshop free-cam HUD's
  // "ROT (rx, ry, rz)" line. facingDeg is the precomputed pixel-space
  // angle (0° = up on the overhead, 90° = right) — what the pin's CSS
  // rotation uses. Stored both so we can recompute facingDeg if
  // calibration ever changes.
  worldRotX?: number;
  worldRotY?: number;
  worldRotZ?: number;
  facingDeg?: number;
  // ISO timestamp set whenever this spot is manually edited in MapEdit
  // (any drag of the pin, or any change to world coords / facing). Acts
  // as both an audit trail and a marker for the calibration-feedback
  // pipeline: when the calibrate page's mode is set to a feedback
  // variant, edited spots are pulled in as additional fit constraints
  // (full weight in "unconditional", reduced weight in "tier-two").
  // Absent on spots that came straight from MapReview's OCR pipeline.
  editedAt?: string;
};

const MAP_SPOTS_BY_KEY = spotsData as Record<string, MapSpot[]>;
const MAP_SPOTS: MapSpot[] = Object.values(MAP_SPOTS_BY_KEY).flat();

/**
 * Read-only view of every captured spot across every map. Used by the
 * dev-only "randomize today's picks" button to shuffle outside the
 * proximity-constrained daily selection, and by any future tool that
 * needs to enumerate the full pool.
 */
export function getAllMapSpots(): ReadonlyArray<MapSpot> {
  return MAP_SPOTS;
}

/**
 * Resolve a list of spot IDs back to MapSpot records, preserving the
 * caller's order. IDs that don't match a known spot are dropped. Used
 * to rehydrate a dev "override" picked-spots list stored in localStorage.
 */
export function getMapSpotsByIds(ids: ReadonlyArray<string>): MapSpot[] {
  const index = new Map(MAP_SPOTS.map((s) => [s.id, s]));
  const out: MapSpot[] = [];
  for (const id of ids) {
    const s = index.get(id);
    if (s) out.push(s);
  }
  return out;
}

// Minimum pixel distance between two picks on the same map. Computed
// per-spot relative to that map's overhead long edge so it scales when
// we add Push / smaller maps later. Default ~12% of long edge keeps
// rounds visually distinct (different streets / capture zones).
const MIN_SAME_MAP_FRACTION = 0.12;

export function getMapRoundsForDay(
  day: string,
  n: number = 5,
): MapSpot[] {
  const pool = MAP_SPOTS;
  if (pool.length === 0) return [];

  const order = shuffleOrder(`owdle:map:${day}`, pool.length);
  const picks: MapSpot[] = [];

  // First pass: enforce the proximity constraint to spread coverage.
  for (const idx of order) {
    if (picks.length >= n) break;
    const cand = pool[idx];
    const tooClose = picks.some((p) => {
      if (p.mapKey !== cand.mapKey) return false;
      const longEdge = Math.max(
        // Overheads are 5000 long edge by current convention; if we
        // ever vary, this falls back to an inferred-from-pixel-coord
        // estimate that's correct for any reasonable square overhead.
        Math.max(p.pixelX, p.pixelY, cand.pixelX, cand.pixelY),
        2500,
      );
      const dx = p.pixelX - cand.pixelX;
      const dy = p.pixelY - cand.pixelY;
      return Math.sqrt(dx * dx + dy * dy) < longEdge * MIN_SAME_MAP_FRACTION;
    });
    if (tooClose) continue;
    picks.push(cand);
  }

  // Second pass: if the constraint left us short (small launch pool,
  // single-map case), backfill from the same shuffled order ignoring
  // proximity. Avoids returning <n rounds.
  if (picks.length < n) {
    const have = new Set(picks.map((p) => p.id));
    for (const idx of order) {
      if (picks.length >= n) break;
      const cand = pool[idx];
      if (!have.has(cand.id)) {
        picks.push(cand);
        have.add(cand.id);
      }
    }
  }

  return picks;
}

// Deterministic permutation of [0, total). Same `seed` always produces
// the same shuffle. Used by Ability mode to pick a per-day reveal order.
export function shuffleOrder(seed: string, total: number): number[] {
  const out = Array.from({ length: total }, (_, i) => i);
  let s = fnv1a(seed) || 1;
  for (let i = total - 1; i > 0; i--) {
    s = (s * 16807) % 2147483647;
    const j = s % (i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

// Human-readable date for display in UI.
export function prettyDay(day: string): string {
  const [y, m, d] = day.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}
