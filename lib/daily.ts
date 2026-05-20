import {
  ANSWER_POOL,
  HEROES_BY_KEY,
  type Ability,
  type Hero,
  type Skin,
} from "./heroes";
import { CONVERSATIONS, type Conversation } from "./conversations";
import sfxData from "@/data/sfx.json";
import soundClipsData from "@/data/sound-clips.json";
import iconOverridesData from "@/data/sound-clip-icons.json";
import soundClipTrimsData from "@/data/sound-clip-trims.json";

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

// Returns the UTC date string YYYY-MM-DD for a given Date (default: now).
export function dayString(d: Date = new Date()): string {
  return d.toISOString().slice(0, 10);
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

export function getHeroForDay(day: string): Hero {
  if (ANSWER_POOL.length === 0) {
    throw new Error("ANSWER_POOL is empty — check data/heroes.json");
  }
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
  const heroIdx = fnv1a(`owdle:ability:${day}`) % ABILITY_POOL.length;
  const hero = ABILITY_POOL[heroIdx];
  const abIdx = fnv1a(`owdle:ability:${day}:idx`) % hero.abilities.length;
  return { hero, ability: hero.abilities[abIdx], abilityIndex: abIdx };
}

// Splash mode picks a hero, then either the default splash or one of that
// hero's skin variants (Epic/Legendary). Skins are weighted ~70% to keep
// visual variety high; the default still appears regularly so newcomers see
// the iconic look. Answer is always the hero — skin is purely cosmetic.
export function getSplashForDay(day: string): {
  hero: Hero;
  imageUrl: string;
  skin: Skin | null;
} {
  if (SPLASH_POOL.length === 0) {
    throw new Error("SPLASH_POOL is empty");
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

export function getConversationForDay(day: string): {
  conversation: Conversation;
  speakers: [Hero, Hero];
} {
  if (CONVERSATION_POOL.length === 0) {
    throw new Error("CONVERSATION_POOL is empty");
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
