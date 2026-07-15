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

// ═════════════════════════════════════════════════════════════════════════
// Rotation v2 (forward-only) — fixes the three repeat problems a 40-day
// answer audit surfaced. Everything below only affects days on or after
// ROTATION_V2_DAY; earlier days keep the exact v1 bag/hash above, so Archive
// replays and share/OG cards that reference past dailies never shift. Like
// every prior cutover (SPLASH_SKINS_ONLY_DAY, …) this is a new forward
// boundary, not a rewrite of history.
//
//   1. EPOCH SEAM. Each v1 epoch was an independent shuffle and the cooldown
//      lookback never crossed the boundary, so heroes reappeared 6–9 days
//      apart at every 50-day mark (the first one landed ~2026-07-13, right
//      when the complaints arrived). v2 threads the previous epoch's tail in
//      as priorHistory, so the cooldown is continuous — no boundary repeats
//      inside the cooldown window, ever.
//   2. QUOTE SKEW. v1 sampled uniformly over 743 conversations with a 3-day
//      cooldown, but conversations-per-hero ran 60× (Lúcio 60 … Sierra 1), so
//      a handful of heroes swamped the daily and 9 never appeared. v2 rotates
//      the PRIMARY speaker through a full draw-without-replacement of all 51
//      heroes (like Classic) and picks the partner by how overdue they are.
//   3. SKIN THEMES. Spotlight's hero rotated fine, but skin *keys* are shared
//      across heroes ("Cosmic" on 10, "Sakura" on 9 …) so the same theme
//      recurred days apart. v2 adds a cross-hero skin-theme cooldown.
// ═════════════════════════════════════════════════════════════════════════

// Manual day → hero / (hero,skin) pins, shared with the resolver in daily.ts
// and honored by the v2 builders so a pin also feeds the cooldown (a pinned
// hero is kept out of the ±cooldown neighborhood — the shion-pin 8-day
// near-repeat can't happen again).
export const CLASSIC_PINS: Record<string, string> = {
  "2026-06-18": "shion", // Shion launch spotlight
};
export const SPLASH_PINS: Record<string, { hero: string; skin: string }> = {
  "2026-06-19": { hero: "shion", skin: "cyber-biker" }, // Shion launch spotlight
};

// IMPORTANT: ROTATION_V2_DAY must be >= the Pacific puzzle day this deploys
// on. A value in the past would retroactively restyle already-served days
// (breaking Archive/share). Bump it if the deploy slips past it. Rolls
// 2:15am Pacific like every puzzle day.
export const ROTATION_V2_DAY = "2026-07-16";
const ROTATION_V2_INDEX = dayStringToIndex(ROTATION_V2_DAY);

export function usesRotationV2(day: string): boolean {
  return dayStringToIndex(day) >= ROTATION_V2_INDEX;
}

function getV2Position(day: string): { epoch: number; slot: number } {
  const idx = dayStringToIndex(day) - ROTATION_V2_INDEX;
  if (idx < 0) {
    throw new Error(`day ${day} is before rotation-v2 ${ROTATION_V2_DAY}`);
  }
  return { epoch: Math.floor(idx / EPOCH_SIZE), slot: idx % EPOCH_SIZE };
}

// Full-rotation modes: every option appears once before any repeat.
const V2_FULL_COOLDOWN = Math.max(0, ANSWER_POOL.length - 1); // 50
// Moderate modes: no repeat within ~2 weeks, while leaving ample room for the
// same-day cross-mode dedup on pools of ~49–51 (49 blocked would over-
// constrain against ≤3 cross-mode blocks; 14 leaves ~34 free).
const V2_MODERATE_COOLDOWN = 14;
// One-time cutover seed depth: how many pre-cutover *served* days feed the
// first v2 epoch's cooldown lookback. Deliberately shorter than the full
// cooldown so the full-rotation modes aren't fully blocked at slot 0.
const V2_BOOTSTRAP_DAYS = 14;
// Spotlight: don't reuse a skin theme (shared skin key) within this window.
const V2_THEME_COOLDOWN = 14;
// Quote: soft floor on partner reuse. Overdue-ness ordering spreads speakers
// much further than this in practice; the floor only guards degenerate ties.
const V2_PARTNER_COOLDOWN = 5;

// Seed the first v2 epoch's cooldown lookback from what v1 actually served on
// the V2_BOOTSTRAP_DAYS puzzle days immediately before the cutover, oldest
// first — so v2 doesn't re-show a hero that just appeared.
function v2BootstrapHistory(
  servedKeysForDay: (day: string) => readonly string[],
): Set<string>[] {
  const out: Set<string>[] = [];
  for (let d = V2_BOOTSTRAP_DAYS; d >= 1; d--) {
    const day = indexToDayString(ROTATION_V2_INDEX - d);
    out.push(new Set(servedKeysForDay(day)));
  }
  return out;
}

// The last `carryover` placed slots of an epoch, as key sets — fed to the
// next epoch as priorHistory so the cooldown lookback is continuous across
// the boundary (kills the seam).
function tailAsHistory<T>(
  list: readonly T[],
  getKeys: (x: T) => string[],
  carryover: number,
): Set<string>[] {
  const start = Math.max(0, list.length - carryover);
  return list.slice(start).map((x) => new Set(getKeys(x)));
}

// Pins that land in this epoch → { forced slot→heroKey, per-slot block sets }.
// The block sets keep the pinned hero out of every slot within `cooldown` of
// the pin so a pin can't cause a near-repeat; the forced map is applied by
// the caller as a post-build overwrite so the bag's list matches what the
// resolver actually shows on the pinned day.
function pinsForEpoch(
  epoch: number,
  cooldown: number,
  pinKeyForDay: (day: string) => string | null,
): { forced: Map<number, string>; blocks: Set<string>[] } {
  const blocks: Set<string>[] = Array.from(
    { length: EPOCH_SIZE },
    () => new Set<string>(),
  );
  const forced = new Map<number, string>();
  const base = ROTATION_V2_INDEX + epoch * EPOCH_SIZE;
  for (let slot = 0; slot < EPOCH_SIZE; slot++) {
    const key = pinKeyForDay(indexToDayString(base + slot));
    if (!key) continue;
    forced.set(slot, key);
    const lo = Math.max(0, slot - cooldown);
    const hi = Math.min(EPOCH_SIZE - 1, slot + cooldown);
    for (let s = lo; s <= hi; s++) {
      if (s !== slot) blocks[s].add(key);
    }
  }
  return { forced, blocks };
}

function mergeBlocks(
  a: ReadonlyArray<ReadonlySet<string>>,
  b: ReadonlyArray<ReadonlySet<string>>,
): Set<string>[] {
  return Array.from({ length: EPOCH_SIZE }, (_, i) => {
    const set = new Set<string>(a[i] ?? []);
    for (const k of b[i] ?? []) set.add(k);
    return set;
  });
}

// ─── v2 epoch lists (continuous cooldown across epoch boundaries) ──────────

function classicEpochListV2(epoch: number): Hero[] {
  return memoize(`v2:classic:${epoch}`, () => {
    const prior =
      epoch === 0
        ? v2BootstrapHistory((day) => [bagClassicHero(day).key])
        : tailAsHistory(
            classicEpochListV2(epoch - 1),
            heroKey,
            V2_FULL_COOLDOWN,
          );
    const { forced, blocks } = pinsForEpoch(
      epoch,
      V2_FULL_COOLDOWN,
      (day) => CLASSIC_PINS[day] ?? null,
    );
    const list = buildEpochList({
      seed: "owdle:classic:v2",
      epoch,
      pool: ANSWER_POOL,
      epochSize: EPOCH_SIZE,
      cooldownDays: V2_FULL_COOLDOWN,
      getHeroKeys: heroKey,
      crossModeKeysPerSlot: blocks,
      priorHistory: prior,
    });
    for (const [slot, key] of forced) {
      const h = HEROES_BY_KEY[key];
      if (h) list[slot] = h;
    }
    return list;
  });
}

function abilityEpochListV2(epoch: number): Hero[] {
  return memoize(`v2:ability:${epoch}`, () => {
    const classic = classicEpochListV2(epoch);
    const cross = classic.map((h) => new Set([h.key]));
    const prior =
      epoch === 0
        ? v2BootstrapHistory((day) => [bagAbilityPick(day).hero.key])
        : tailAsHistory(
            abilityEpochListV2(epoch - 1),
            heroKey,
            V2_MODERATE_COOLDOWN,
          );
    return buildEpochList({
      seed: "owdle:ability:v2",
      epoch,
      pool: ABILITY_POOL,
      epochSize: EPOCH_SIZE,
      cooldownDays: V2_MODERATE_COOLDOWN,
      getHeroKeys: heroKey,
      crossModeKeysPerSlot: cross,
      priorHistory: prior,
    });
  });
}

// Spotlight hero list. v2 is entirely in the legendary-only era (cutover is
// after SPLASH_LEGENDARY_ONLY_DAY), so it draws from SKINS_SPLASH_POOL and
// the skin is chosen theme-aware by splashSkinAssignmentV2.
function splashEpochListV2(epoch: number): Hero[] {
  return memoize(`v2:splash:${epoch}`, () => {
    const classic = classicEpochListV2(epoch);
    const ability = abilityEpochListV2(epoch);
    const cross = classic.map((h, i) => new Set([h.key, ability[i].key]));
    const prior =
      epoch === 0
        ? v2BootstrapHistory((day) => [bagSplashPick(day).hero.key])
        : tailAsHistory(
            splashEpochListV2(epoch - 1),
            heroKey,
            V2_MODERATE_COOLDOWN,
          );
    const { forced, blocks } = pinsForEpoch(
      epoch,
      V2_MODERATE_COOLDOWN,
      (day) => SPLASH_PINS[day]?.hero ?? null,
    );
    const list = buildEpochList({
      seed: "owdle:splash:v2",
      epoch,
      pool: SKINS_SPLASH_POOL,
      epochSize: EPOCH_SIZE,
      cooldownDays: V2_MODERATE_COOLDOWN,
      getHeroKeys: heroKey,
      crossModeKeysPerSlot: mergeBlocks(cross, blocks),
      priorHistory: prior,
    });
    for (const [slot, key] of forced) {
      const h = HEROES_BY_KEY[key];
      if (h) list[slot] = h;
    }
    return list;
  });
}

function soundEpochListV2(epoch: number): string[] {
  return memoize(`v2:sound:${epoch}`, () => {
    const classic = classicEpochListV2(epoch);
    const ability = abilityEpochListV2(epoch);
    const splash = splashEpochListV2(epoch);
    const cross = classic.map(
      (h, i) => new Set([h.key, ability[i].key, splash[i].key]),
    );
    const prior =
      epoch === 0
        ? v2BootstrapHistory((day) => [bagSoundPick(day).heroKey])
        : tailAsHistory(
            soundEpochListV2(epoch - 1),
            (k) => [k],
            V2_MODERATE_COOLDOWN,
          );
    return buildEpochList({
      seed: "owdle:sound:v2",
      epoch,
      pool: LABELED_SOUND_KEYS,
      epochSize: EPOCH_SIZE,
      cooldownDays: V2_MODERATE_COOLDOWN,
      getHeroKeys: (k) => [k],
      crossModeKeysPerSlot: cross,
      priorHistory: prior,
    });
  });
}

// Per-epoch skin index for each Spotlight slot, avoiding any skin theme
// (shared skin key) shown within V2_THEME_COOLDOWN days. Falls back to the
// hero's first eligible legendary when every theme is on cooldown (or the
// hero has a single eligible skin, e.g. domina/mizuki).
function splashSkinAssignmentV2(epoch: number): (number | null)[] {
  return memoize(`v2:splash:skin:${epoch}`, () => {
    const heroes = splashEpochListV2(epoch);
    const recentTheme = new Map<string, number>();
    const out: (number | null)[] = [];
    for (let slot = 0; slot < EPOCH_SIZE; slot++) {
      const hero = heroes[slot];
      const eligible = legendaryEligibleSkinIndices(hero);
      if (eligible.length === 0) {
        out.push(null);
        continue;
      }
      const order = splashLegendaryOrder(epoch, hero);
      let chosen = order[0];
      for (const idx of order) {
        const last = recentTheme.get(hero.skins[idx].key);
        if (last == null || slot - last > V2_THEME_COOLDOWN) {
          chosen = idx;
          break;
        }
      }
      out.push(chosen);
      recentTheme.set(hero.skins[chosen].key, slot);
    }
    return out;
  });
}

// ─── Quote v2: full speaker rotation + overdue-partner conversation pick ────
//
// The primary speaker is a full 51-hero draw-without-replacement, so every
// hero anchors a Quote day before repeats and the v1 60× skew is gone (audit:
// max 5 vs min 2 appearances over 82 days; every hero appears; the same PAIR
// never recurs inside ~3 weeks). Residual: the 2–3 heroes with almost no
// eligible conversations (Sierra has exactly ONE, Mizuki three) occasionally
// land on near-adjacent days — always with a DIFFERENT partner, because a
// sparse conversation graph forces it. That's a cosmetic artifact of the
// source data, not the "same two heroes" complaint, and squeezing it out
// would mean dropping those heroes from coverage (recreating the v1 "never
// appears" bug), so it's left as-is.

// Conversations featuring each hero (either speaker slot), and a stable id
// per conversation (its index in CONVERSATION_POOL) for the seeded tiebreak.
const CONV_INDEX = new Map<Conversation, number>(
  CONVERSATION_POOL.map((c, i) => [c, i]),
);
const CONV_BY_HERO = (() => {
  const m = new Map<string, Conversation[]>();
  for (const c of CONVERSATION_POOL) {
    for (const s of [c.speakers[0], c.speakers[1]]) {
      const arr = m.get(s);
      if (arr) arr.push(c);
      else m.set(s, [c]);
    }
  }
  return m;
})();

// Primary speaker: a full draw-without-replacement over every hero, exactly
// like Classic, so each hero anchors a Quote day before any repeats.
function quoteAnchorEpochListV2(epoch: number): Hero[] {
  return memoize(`v2:quote:anchor:${epoch}`, () => {
    const prior =
      epoch === 0
        ? v2BootstrapHistory((day) => {
            const c = bagQuoteConversation(day);
            return [c.speakers[0], c.speakers[1]];
          })
        : tailAsHistory(
            quoteAnchorEpochListV2(epoch - 1),
            heroKey,
            V2_FULL_COOLDOWN,
          );
    return buildEpochList({
      seed: "owdle:quote:anchor:v2",
      epoch,
      pool: ANSWER_POOL,
      epochSize: EPOCH_SIZE,
      cooldownDays: V2_FULL_COOLDOWN,
      getHeroKeys: heroKey,
      crossModeKeysPerSlot: [],
      priorHistory: prior,
    });
  });
}

function quoteEpochListV2(epoch: number): Conversation[] {
  return memoize(`v2:quote:${epoch}`, () => {
    const anchors = quoteAnchorEpochListV2(epoch);
    const classic = classicEpochListV2(epoch);
    const ability = abilityEpochListV2(epoch);
    const splash = splashEpochListV2(epoch);
    const sound = soundEpochListV2(epoch);

    // Partner recency: effective-slot index each hero last spoke (either
    // role). Seeded from the previous epoch's tail (negative indices) or, at
    // the cutover, from the days v1 actually served.
    const lastSpoken = new Map<string, number>();
    const bootstrapLen = epoch === 0 ? V2_BOOTSTRAP_DAYS : 0;
    if (epoch === 0) {
      for (let d = V2_BOOTSTRAP_DAYS; d >= 1; d--) {
        const c = bagQuoteConversation(
          indexToDayString(ROTATION_V2_INDEX - d),
        );
        const eff = V2_BOOTSTRAP_DAYS - d;
        lastSpoken.set(c.speakers[0], eff);
        lastSpoken.set(c.speakers[1], eff);
      }
    } else {
      const prev = quoteEpochListV2(epoch - 1);
      prev.forEach((c, i) => {
        const eff = i - prev.length;
        lastSpoken.set(c.speakers[0], eff);
        lastSpoken.set(c.speakers[1], eff);
      });
    }

    // Slot each hero anchors this epoch (unique — full rotation). Used to
    // avoid picking a partner who's about to anchor within the cooldown: the
    // anchor rotation is blind to partner usage, so without this a hero could
    // speak as a partner and then anchor 2–3 days later (a tight repeat).
    const anchorSlotOf = new Map<string, number>();
    anchors.forEach((h, s) => {
      if (!anchorSlotOf.has(h.key)) anchorSlotOf.set(h.key, s);
    });

    const result: Conversation[] = [];
    for (let slot = 0; slot < EPOCH_SIZE; slot++) {
      const anchorKey = anchors[slot].key;
      const eff = bootstrapLen + slot;
      const cross = new Set([
        classic[slot].key,
        ability[slot].key,
        splash[slot].key,
        sound[slot],
      ]);
      const cands = CONV_BY_HERO.get(anchorKey) ?? [];
      const partnerOf = (c: Conversation) =>
        c.speakers[0] === anchorKey ? c.speakers[1] : c.speakers[0];
      const overdue = (c: Conversation) =>
        eff - (lastSpoken.get(partnerOf(c)) ?? -9999);
      const anchorsSoon = (c: Conversation) => {
        const a = anchorSlotOf.get(partnerOf(c));
        return a != null && a > slot && a - slot <= V2_PARTNER_COOLDOWN;
      };

      // 3-pass: prefer an overdue partner that isn't one of today's other
      // heroes and isn't about to anchor; then just a non-recent partner;
      // then anything the anchor has.
      const passes: Array<(c: Conversation) => boolean> = [
        (c) =>
          !cross.has(partnerOf(c)) &&
          overdue(c) > V2_PARTNER_COOLDOWN &&
          !anchorsSoon(c),
        (c) => overdue(c) > V2_PARTNER_COOLDOWN && !anchorsSoon(c),
        () => true,
      ];
      let pick: Conversation | null = null;
      for (const ok of passes) {
        let best: Conversation | null = null;
        let bestScore = -Infinity;
        let bestTie = Infinity;
        for (const c of cands) {
          if (!ok(c)) continue;
          const score = overdue(c);
          const tie = fnv1a(
            `owdle:quote:v2:e${epoch}:s${slot}:${CONV_INDEX.get(c)}`,
          );
          if (score > bestScore || (score === bestScore && tie < bestTie)) {
            best = c;
            bestScore = score;
            bestTie = tie;
          }
        }
        if (best) {
          pick = best;
          break;
        }
      }
      if (!pick) pick = cands[0] ?? CONVERSATION_POOL[0];
      result.push(pick);
      lastSpoken.set(pick.speakers[0], eff);
      lastSpoken.set(pick.speakers[1], eff);
    }
    return result;
  });
}

// ─── v2 resolvers ──────────────────────────────────────────────────────────

export function bagClassicHeroV2(day: string): Hero {
  const { epoch, slot } = getV2Position(day);
  return classicEpochListV2(epoch)[slot];
}

export function bagAbilityPickV2(day: string): {
  hero: Hero;
  abilityIndex: number;
} {
  const { epoch, slot } = getV2Position(day);
  const list = abilityEpochListV2(epoch);
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

export function bagSplashPickV2(day: string): {
  hero: Hero;
  skinIndex: number | null;
} {
  const { epoch, slot } = getV2Position(day);
  const hero = splashEpochListV2(epoch)[slot];
  const skinIndex = splashSkinAssignmentV2(epoch)[slot];
  return { hero, skinIndex };
}

export function bagSoundPickV2(day: string): {
  heroKey: string;
  clipSlug: string;
} {
  const { epoch, slot } = getV2Position(day);
  const list = soundEpochListV2(epoch);
  const hKey = list[slot];
  const clips = SOUND_CLIPS[hKey] ?? [];
  if (clips.length === 0) {
    throw new Error(`bagSoundPickV2: ${hKey} has no labeled clips`);
  }
  const appearance = appearanceCountInEpoch(list, slot, (k) => k === hKey);
  const order = soundSubPuzzleOrder(epoch, hKey);
  const clipIdx = order[(appearance - 1) % order.length];
  return { heroKey: hKey, clipSlug: clips[clipIdx].slug };
}

export function bagQuoteConversationV2(day: string): Conversation {
  const { epoch, slot } = getV2Position(day);
  return quoteEpochListV2(epoch)[slot];
}
