import { ANSWER_POOL, HEROES_BY_KEY, type Hero } from "./heroes";
import { CONVERSATIONS, type Conversation } from "./conversations";
import soundClipsData from "@/data/sound-clips.json";

type SoundClip = {
  slug: string;
  label: string;
  audioUrl: string;
  videoUrl: string | null;
  duration: number;
};
const SOUND_CLIPS = soundClipsData as Record<string, SoundClip[]>;

// First Pacific puzzle day that uses the bag-shuffled picker. Days strictly
// before this keep the legacy hash-modulo logic in lib/daily.ts so any
// historical "yesterday's answer" surfaces don't shift retroactively.
export const BAG_CUTOVER_DAY = "2026-05-24";

const EPOCH_SIZE = 50;
const CONSTRAINED_COOLDOWN = 3;
// Per-day weighted choice: 80% skin, 20% default art. Independent of how
// often a hero appears in an epoch — keeps the ratio stable at 80:20 even
// though pool=51 and epoch=50 means most heroes appear ~once per epoch.
// Only applies to days before the skins-only cutover below.
const SPLASH_SKIN_PCT = 80;

// Skins-only cutover for Spotlight: from this Pacific puzzle day onward the
// mode ALWAYS shows a skin (never default splash art) and the hero pool
// drops heroes with no Epic/Legendary skins. Days in
// [BAG_CUTOVER_DAY, this) keep the 80/20 weighted behavior so answers
// already served don't shift retroactively.
export const SPLASH_SKINS_ONLY_DAY = "2026-06-06";

// Legendary-only cutover for Spotlight: from this Pacific puzzle day onward
// the mode shows LEGENDARY skins only — no Epic recolors (which read as
// near-identical to the base look) and no default splash art. The two
// exception heroes below are the sole exemption. Days in
// [SPLASH_SKINS_ONLY_DAY, this) keep the all-skins rotation so skins
// already served don't shift retroactively. The hero pool is unchanged
// (SKINS_SPLASH_POOL), so daily HERO answers are identical across this
// cutover — only which skin is shown changes.
//
// Set to the current puzzle day (rolls 2:15am Pacific) so the rule is live
// immediately rather than starting on the next daily.
export const SPLASH_LEGENDARY_ONLY_DAY = "2026-07-03";

// Heroes exempt from legendary-only: brand-new characters too skin-poor
// for a legendary-only rotation to be fair. They rotate through their
// legendary skin(s) AND their default "Classic" splash so they still
// appear and stay recognizable. Everyone else is strictly legendary.
// (Sierra: 1 legendary "Painter" + Classic. Shion: 1 legendary "Cyber
// Biker" + Classic.)
const SPLASH_BASE_ART_HEROES = new Set(["sierra", "shion"]);

// One-time cutover bootstrap: the bag's epoch 0 generator sees the 5 legacy
// puzzle days immediately before cutover as if they were prior slots, so the
// first bag picks don't repeat heroes shown in the final week of the legacy
// era. Within-mode only — does not apply to subsequent epoch boundaries
// (Yash's call: "doesn't need to be cyclical, it's one time").
const CUTOVER_BOOTSTRAP_DAYS = 5;

const ABILITY_POOL: Hero[] = ANSWER_POOL.filter((h) => h.abilities.length > 0);
const SPLASH_POOL: Hero[] = ANSWER_POOL.filter((h) => h.splash_url != null);
// Skins-only / legendary-only era pool: a hero must own at least one skin
// entry to be the daily Spotlight answer. Every answer-eligible hero
// qualifies — the two legendary-poor new heroes (Sierra, Shion) are kept
// in via their hand-added "common" default entry in skins.json, and are
// exempted from legendary-only via SPLASH_BASE_ART_HEROES.
const SKINS_SPLASH_POOL: Hero[] = ANSWER_POOL.filter(
  (h) => h.splash_url != null && h.skins.length > 0,
);
const LABELED_SOUND_KEYS: string[] = ANSWER_POOL.map((h) => h.key).filter(
  (k) => (SOUND_CLIPS[k] ?? []).length > 0,
);
const CONVERSATION_POOL: Conversation[] = CONVERSATIONS.filter((c) => {
  const a = HEROES_BY_KEY[c.speakers[0]];
  const b = HEROES_BY_KEY[c.speakers[1]];
  return !!a && !!b && ANSWER_POOL.includes(a) && ANSWER_POOL.includes(b);
});

// Classic uses a near-pool-size cooldown so each hero appears exactly
// once before any repeat — the full-roster rotation Yash asked for.
const CLASSIC_COOLDOWN = Math.max(0, ANSWER_POOL.length - 1);

function dayStringToIndex(day: string): number {
  const [y, m, d] = day.split("-").map(Number);
  return Math.floor(Date.UTC(y, m - 1, d) / 86400000);
}

function indexToDayString(idx: number): string {
  return new Date(idx * 86400000).toISOString().slice(0, 10);
}

const BAG_CUTOVER_INDEX = dayStringToIndex(BAG_CUTOVER_DAY);
const SPLASH_SKINS_ONLY_INDEX = dayStringToIndex(SPLASH_SKINS_ONLY_DAY);
const SPLASH_LEGENDARY_ONLY_INDEX = dayStringToIndex(SPLASH_LEGENDARY_ONLY_DAY);

export function usesBag(day: string): boolean {
  return dayStringToIndex(day) >= BAG_CUTOVER_INDEX;
}

function getBagPosition(day: string): { epoch: number; slot: number } {
  const idx = dayStringToIndex(day) - BAG_CUTOVER_INDEX;
  if (idx < 0) {
    throw new Error(`day ${day} is before bag cutover ${BAG_CUTOVER_DAY}`);
  }
  return { epoch: Math.floor(idx / EPOCH_SIZE), slot: idx % EPOCH_SIZE };
}

function fnv1a(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
  }
  return h >>> 0;
}

function seededShuffle<T>(seed: string, items: readonly T[]): T[] {
  const out = items.slice();
  let s = fnv1a(seed) || 1;
  for (let i = out.length - 1; i > 0; i--) {
    s = (s * 16807) % 2147483647;
    const j = s % (i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

const epochCache = new Map<string, unknown>();
function memoize<T>(key: string, build: () => T): T {
  if (epochCache.has(key)) return epochCache.get(key) as T;
  const val = build();
  epochCache.set(key, val);
  return val;
}

// Build one epoch's slot list via greedy placement on a seeded shuffle.
// At each slot we walk the shuffled order from a moving cursor, taking
// the first item whose hero keys don't conflict with:
//   - placedKeys in the last `cooldownDays` slots (within-mode cooldown)
//   - crossModeKeysPerSlot[slot]              (same-day cross-mode dedup)
//
// Three-pass fallback: strict → relax cross-mode → relax everything.
// With production pool sizes (≥49, cooldown ≤3, cross-mode blocks ≤3)
// pass 1 always succeeds; the relaxations only matter for synthetic
// edge cases where the pool can't satisfy both constraints.
function buildEpochList<T>(opts: {
  seed: string;
  epoch: number;
  pool: readonly T[];
  epochSize: number;
  cooldownDays: number;
  getHeroKeys: (item: T) => string[];
  crossModeKeysPerSlot: ReadonlyArray<ReadonlySet<string>>;
  // priorHistory is virtually prepended to placedKeys so the cooldown
  // lookback at slot 0 sees these entries as "the last N days" — used at
  // cutover to seed the first epoch with the legacy era's tail. Empty for
  // all subsequent epochs.
  priorHistory?: ReadonlyArray<ReadonlySet<string>>;
}): T[] {
  const {
    seed,
    epoch,
    pool,
    epochSize,
    cooldownDays,
    getHeroKeys,
    crossModeKeysPerSlot,
  } = opts;
  const priorHistory = opts.priorHistory ?? [];
  if (pool.length === 0) return [];

  const shuffled = seededShuffle(`${seed}:e${epoch}`, pool);
  const result: T[] = [];
  const placedKeys: Set<string>[] = [];
  let cursor = 0;

  for (let slot = 0; slot < epochSize; slot++) {
    const blockedRecent = new Set<string>();
    // Effective slot position when priorHistory is virtually prepended:
    // pretend `priorHistory.length` slots already exist before slot 0.
    const effectiveSlot = priorHistory.length + slot;
    const cooldownStart = Math.max(0, effectiveSlot - cooldownDays);
    for (let effI = cooldownStart; effI < effectiveSlot; effI++) {
      const fromPrior =
        effI < priorHistory.length
          ? priorHistory[effI]
          : placedKeys[effI - priorHistory.length];
      for (const k of fromPrior) blockedRecent.add(k);
    }
    const blockedCross = crossModeKeysPerSlot[slot] ?? new Set<string>();

    const passes: Array<(keys: string[]) => boolean> = [
      (keys) => keys.some((k) => blockedRecent.has(k) || blockedCross.has(k)),
      (keys) => keys.some((k) => blockedRecent.has(k)),
      () => false,
    ];

    let picked: T | null = null;
    for (const isBlocked of passes) {
      for (let step = 0; step < shuffled.length; step++) {
        const idx = (cursor + step) % shuffled.length;
        const cand = shuffled[idx];
        if (!isBlocked(getHeroKeys(cand))) {
          picked = cand;
          cursor = (idx + 1) % shuffled.length;
          break;
        }
      }
      if (picked) break;
    }
    if (!picked) {
      picked = shuffled[cursor];
      cursor = (cursor + 1) % shuffled.length;
    }
    result.push(picked);
    placedKeys.push(new Set(getHeroKeys(picked)));
  }
  return result;
}

const heroKey = (h: Hero): string[] => [h.key];

// Legacy hero pickers mirroring the pre-cutover hash-modulo logic in
// lib/daily.ts. Used once, at cutover, to seed each mode's bootstrap
// priorHistory. Only the hero/speakers matter for within-mode cooldown —
// sub-puzzle resolution (ability index, skin index, clip slug) is not
// needed here.
function legacyClassicKey(day: string): string {
  return ANSWER_POOL[fnv1a(`owdle:classic:${day}`) % ANSWER_POOL.length].key;
}
function legacyAbilityKey(day: string): string {
  return ABILITY_POOL[fnv1a(`owdle:ability:${day}`) % ABILITY_POOL.length].key;
}
function legacySplashKey(day: string): string {
  return SPLASH_POOL[fnv1a(`owdle:splash:${day}`) % SPLASH_POOL.length].key;
}
function legacySoundKey(day: string): string | null {
  if (LABELED_SOUND_KEYS.length === 0) return null;
  return LABELED_SOUND_KEYS[
    fnv1a(`owdle:sound:r8:${day}`) % LABELED_SOUND_KEYS.length
  ];
}
function legacyQuoteSpeakerKeys(day: string): [string, string] | null {
  if (CONVERSATION_POOL.length === 0) return null;
  const c =
    CONVERSATION_POOL[
      fnv1a(`owdle:conversation:r2:${day}`) % CONVERSATION_POOL.length
    ];
  return [c.speakers[0], c.speakers[1]];
}

function buildCutoverBootstrap(
  getKeysForDay: (day: string) => readonly string[] | null,
): ReadonlySet<string>[] {
  const out: Set<string>[] = [];
  for (let d = CUTOVER_BOOTSTRAP_DAYS; d >= 1; d--) {
    const day = indexToDayString(BAG_CUTOVER_INDEX - d);
    const keys = getKeysForDay(day);
    out.push(new Set(keys ?? []));
  }
  return out;
}

function classicEpochList(epoch: number): Hero[] {
  return memoize(`classic:${epoch}`, () =>
    buildEpochList({
      seed: "owdle:classic:bag",
      epoch,
      pool: ANSWER_POOL,
      epochSize: EPOCH_SIZE,
      cooldownDays: CLASSIC_COOLDOWN,
      getHeroKeys: heroKey,
      crossModeKeysPerSlot: [],
      priorHistory:
        epoch === 0
          ? buildCutoverBootstrap((day) => [legacyClassicKey(day)])
          : undefined,
    }),
  );
}

function abilityEpochList(epoch: number): Hero[] {
  return memoize(`ability:${epoch}`, () => {
    const classic = classicEpochList(epoch);
    const cross = classic.map((h) => new Set([h.key]));
    return buildEpochList({
      seed: "owdle:ability:bag",
      epoch,
      pool: ABILITY_POOL,
      epochSize: EPOCH_SIZE,
      cooldownDays: CONSTRAINED_COOLDOWN,
      getHeroKeys: heroKey,
      crossModeKeysPerSlot: cross,
      priorHistory:
        epoch === 0
          ? buildCutoverBootstrap((day) => [legacyAbilityKey(day)])
          : undefined,
    });
  });
}

function splashEpochList(epoch: number): Hero[] {
  return memoize(`splash:${epoch}`, () => {
    const classic = classicEpochList(epoch);
    const ability = abilityEpochList(epoch);
    const cross = classic.map((h, i) => new Set([h.key, ability[i].key]));
    return buildEpochList({
      seed: "owdle:splash:bag",
      epoch,
      pool: SPLASH_POOL,
      epochSize: EPOCH_SIZE,
      cooldownDays: CONSTRAINED_COOLDOWN,
      getHeroKeys: heroKey,
      crossModeKeysPerSlot: cross,
      priorHistory:
        epoch === 0
          ? buildCutoverBootstrap((day) => [legacySplashKey(day)])
          : undefined,
    });
  });
}

function soundEpochList(epoch: number): string[] {
  return memoize(`sound:${epoch}`, () => {
    const classic = classicEpochList(epoch);
    const ability = abilityEpochList(epoch);
    const splash = splashEpochList(epoch);
    const cross = classic.map(
      (h, i) => new Set([h.key, ability[i].key, splash[i].key]),
    );
    return buildEpochList({
      seed: "owdle:sound:bag",
      epoch,
      pool: LABELED_SOUND_KEYS,
      epochSize: EPOCH_SIZE,
      cooldownDays: CONSTRAINED_COOLDOWN,
      getHeroKeys: (k) => [k],
      crossModeKeysPerSlot: cross,
      priorHistory:
        epoch === 0
          ? buildCutoverBootstrap((day) => {
              const k = legacySoundKey(day);
              return k ? [k] : null;
            })
          : undefined,
    });
  });
}

// Skins-only era Spotlight list. Built AFTER soundEpochList — unlike the
// original splash list, which sound dedups against — so the sound picks
// already served (and their epoch list) stay frozen across the cutover;
// this list instead dedups against all three siblings itself.
function skinsSplashEpochList(epoch: number): Hero[] {
  return memoize(`splash:skins:${epoch}`, () => {
    const classic = classicEpochList(epoch);
    const ability = abilityEpochList(epoch);
    const sound = soundEpochList(epoch);
    const cross = classic.map(
      (h, i) => new Set([h.key, ability[i].key, sound[i]]),
    );

    // One-time mid-epoch cutover guard (mirrors the cutover bootstrap):
    // the first CONSTRAINED_COOLDOWN slots of the skins-only era also
    // block whatever the OLD splash list actually served in the days
    // immediately before the cutover, since this list's own cooldown
    // lookback only sees its own (never-served) earlier slots.
    const cut = getBagPosition(SPLASH_SKINS_ONLY_DAY);
    if (epoch === cut.epoch) {
      const oldList = splashEpochList(epoch);
      const guardEnd = Math.min(cut.slot + CONSTRAINED_COOLDOWN, EPOCH_SIZE);
      for (let s = cut.slot; s < guardEnd; s++) {
        const lookbackStart = Math.max(0, s - CONSTRAINED_COOLDOWN);
        for (let b = lookbackStart; b < cut.slot && b < s; b++) {
          cross[s].add(oldList[b].key);
        }
      }
    }

    return buildEpochList({
      seed: "owdle:splash:skins:bag",
      epoch,
      pool: SKINS_SPLASH_POOL,
      epochSize: EPOCH_SIZE,
      cooldownDays: CONSTRAINED_COOLDOWN,
      getHeroKeys: heroKey,
      crossModeKeysPerSlot: cross,
    });
  });
}

function quoteEpochList(epoch: number): Conversation[] {
  return memoize(`quote:${epoch}`, () =>
    buildEpochList({
      seed: "owdle:quote:bag",
      epoch,
      pool: CONVERSATION_POOL,
      epochSize: EPOCH_SIZE,
      cooldownDays: CONSTRAINED_COOLDOWN,
      getHeroKeys: (c) => [c.speakers[0], c.speakers[1]],
      crossModeKeysPerSlot: [],
      priorHistory:
        epoch === 0
          ? buildCutoverBootstrap((day) => legacyQuoteSpeakerKeys(day))
          : undefined,
    }),
  );
}

function appearanceCountInEpoch<T>(
  list: readonly T[],
  slot: number,
  matches: (item: T) => boolean,
): number {
  let count = 0;
  for (let i = 0; i <= slot; i++) {
    if (matches(list[i])) count++;
  }
  return count;
}

function abilitySubPuzzleOrder(epoch: number, hero: Hero): number[] {
  const n = hero.abilities.length;
  if (n <= 1) return Array.from({ length: n }, (_, i) => i);
  return memoize(`ability:sub:${epoch}:${hero.key}`, () =>
    seededShuffle(
      `owdle:ability:sub:e${epoch}:${hero.key}`,
      Array.from({ length: n }, (_, i) => i),
    ),
  );
}

function soundSubPuzzleOrder(epoch: number, hKey: string): number[] {
  const clips = SOUND_CLIPS[hKey] ?? [];
  if (clips.length <= 1)
    return Array.from({ length: clips.length }, (_, i) => i);
  return memoize(`sound:sub:${epoch}:${hKey}`, () =>
    seededShuffle(
      `owdle:sound:sub:e${epoch}:${hKey}`,
      Array.from({ length: clips.length }, (_, i) => i),
    ),
  );
}

function splashSkinOrder(epoch: number, hero: Hero): number[] {
  if (hero.skins.length <= 1)
    return Array.from({ length: hero.skins.length }, (_, i) => i);
  return memoize(`splash:skin:${epoch}:${hero.key}`, () =>
    seededShuffle(
      `owdle:splash:skin:e${epoch}:${hero.key}`,
      Array.from({ length: hero.skins.length }, (_, i) => i),
    ),
  );
}

// Skin indices eligible for the legendary-only Spotlight era. Normally just
// this hero's legendary skins; for the base-art exception heroes it also
// includes their "common" default splash so it stays in the rotation.
function legendaryEligibleSkinIndices(hero: Hero): number[] {
  const allowCommon = SPLASH_BASE_ART_HEROES.has(hero.key);
  const out: number[] = [];
  hero.skins.forEach((s, i) => {
    if (s.rarity === "legendary" || (allowCommon && s.rarity === "common")) {
      out.push(i);
    }
  });
  return out;
}

// Legendary-only counterpart to splashSkinOrder: a per-epoch seeded shuffle
// over just the eligible (legendary, plus default for exception heroes)
// skin indices. Separate seed namespace so it doesn't have to line up with
// the all-skins order the pre-cutover era uses.
function splashLegendaryOrder(epoch: number, hero: Hero): number[] {
  const idxs = legendaryEligibleSkinIndices(hero);
  if (idxs.length <= 1) return idxs;
  return memoize(`splash:legendary:${epoch}:${hero.key}`, () =>
    seededShuffle(`owdle:splash:legendary:e${epoch}:${hero.key}`, idxs),
  );
}

// ─── Per-mode resolvers ────────────────────────────────────────────────

export function bagClassicHero(day: string): Hero {
  const { epoch, slot } = getBagPosition(day);
  return classicEpochList(epoch)[slot];
}

export function bagAbilityPick(day: string): {
  hero: Hero;
  abilityIndex: number;
} {
  const { epoch, slot } = getBagPosition(day);
  const list = abilityEpochList(epoch);
  const hero = list[slot];
  const appearance = appearanceCountInEpoch(
    list,
    slot,
    (h) => h.key === hero.key,
  );
  const order = abilitySubPuzzleOrder(epoch, hero);
  const abilityIndex = order[(appearance - 1) % Math.max(1, order.length)];
  return { hero, abilityIndex };
}

export function bagSplashPick(day: string): {
  hero: Hero;
  skinIndex: number | null;
} {
  const { epoch, slot } = getBagPosition(day);
  const dayIdx = dayStringToIndex(day);

  // Legendary-only era: same hero list as the skins-only era (so answers
  // don't shift), but the skin is drawn from the hero's LEGENDARY skins
  // only. The two exception heroes also keep their default "Classic" art
  // in the rotation via legendaryEligibleSkinIndices.
  if (dayIdx >= SPLASH_LEGENDARY_ONLY_INDEX) {
    const list = skinsSplashEpochList(epoch);
    const hero = list[slot];
    const order = splashLegendaryOrder(epoch, hero);
    // Defensive: a pool hero with no eligible skin (shouldn't happen —
    // every hero here has a legendary, and the exceptions have a common
    // default) falls back to base splash art.
    if (order.length === 0) return { hero, skinIndex: null };
    const appearance = appearanceCountInEpoch(
      list,
      slot,
      (h) => h.key === hero.key,
    );
    return { hero, skinIndex: order[(appearance - 1) % order.length] };
  }

  // Skins-only era: every day is a skin. Hero comes from the dedicated
  // skins-capable list; the skin itself rotates through the same seeded
  // per-hero shuffle the 80/20 era used.
  if (dayIdx >= SPLASH_SKINS_ONLY_INDEX) {
    const list = skinsSplashEpochList(epoch);
    const hero = list[slot];
    const order = splashSkinOrder(epoch, hero);
    const appearance = appearanceCountInEpoch(
      list,
      slot,
      (h) => h.key === hero.key,
    );
    return { hero, skinIndex: order[(appearance - 1) % order.length] };
  }

  const list = splashEpochList(epoch);
  const hero = list[slot];

  const useSkin =
    hero.skins.length > 0 &&
    fnv1a(`owdle:splash:variant:bag:d${dayIdx}`) % 100 < SPLASH_SKIN_PCT;
  if (!useSkin) return { hero, skinIndex: null };

  // Skin rotation: cycle a seeded shuffle of this hero's skins by their
  // appearance count within the epoch. Since heroes typically appear ~once
  // per epoch (pool=51, epoch=50), variety across days comes from the
  // epoch-keyed seed reshuffling between epochs, not from cycling within.
  const order = splashSkinOrder(epoch, hero);
  const appearance = appearanceCountInEpoch(
    list,
    slot,
    (h) => h.key === hero.key,
  );
  return { hero, skinIndex: order[(appearance - 1) % order.length] };
}

export function bagSoundPick(day: string): {
  heroKey: string;
  clipSlug: string;
} {
  const { epoch, slot } = getBagPosition(day);
  const list = soundEpochList(epoch);
  const hKey = list[slot];
  const clips = SOUND_CLIPS[hKey] ?? [];
  if (clips.length === 0) {
    throw new Error(`bagSoundPick: ${hKey} has no labeled clips`);
  }
  const appearance = appearanceCountInEpoch(list, slot, (k) => k === hKey);
  const order = soundSubPuzzleOrder(epoch, hKey);
  const clipIdx = order[(appearance - 1) % order.length];
  return { heroKey: hKey, clipSlug: clips[clipIdx].slug };
}

export function bagQuoteConversation(day: string): Conversation {
  const { epoch, slot } = getBagPosition(day);
  return quoteEpochList(epoch)[slot];
}
