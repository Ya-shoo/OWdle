#!/usr/bin/env node
// Standalone verifier for the lib/dailyBag.ts bag system. Re-implements
// the same FNV-1a + seeded Park-Miller LCG + greedy epoch-list builder
// directly here (no module imports) and runs constraint checks against
// real pool sizes pulled from data/. Run with:
//   node scripts/verify-daily-bag.mjs
import fs from "node:fs";

const heroes = JSON.parse(fs.readFileSync("data/heroes.json", "utf8"));
const soundClips = JSON.parse(fs.readFileSync("data/sound-clips.json", "utf8"));
const convs = JSON.parse(
  fs.readFileSync("data/quote-conversations.json", "utf8"),
);
const skins = JSON.parse(fs.readFileSync("data/skins.json", "utf8"));

const EPOCH_SIZE = 50;
const CONSTRAINED_COOLDOWN = 3;
const SPLASH_SKIN_PCT = 80;
const CUTOVER_BOOTSTRAP_DAYS = 5;

const BAG_CUTOVER_DAY = "2026-05-24";
function dayStringToIndex(day) {
  const [y, m, d] = day.split("-").map(Number);
  return Math.floor(Date.UTC(y, m - 1, d) / 86400000);
}
function indexToDayString(idx) {
  return new Date(idx * 86400000).toISOString().slice(0, 10);
}
const BAG_CUTOVER_INDEX = dayStringToIndex(BAG_CUTOVER_DAY);
function dayIndexForEpochSlot(epoch, slot) {
  return BAG_CUTOVER_INDEX + epoch * EPOCH_SIZE + slot;
}

const answerHeroes = heroes.filter((h) => h && h.key);
const heroesByKey = Object.fromEntries(answerHeroes.map((h) => [h.key, h]));

const abilityPool = answerHeroes.filter(
  (h) => Array.isArray(h.abilities) && h.abilities.length > 0,
);
const splashPool = answerHeroes.filter((h) => h.splash_url != null);
const labeledSoundKeys = answerHeroes
  .map((h) => h.key)
  .filter((k) => (soundClips[k] ?? []).length > 0);
const convPool = convs.filter((c) => {
  const a = heroesByKey[c.speakers[0]];
  const b = heroesByKey[c.speakers[1]];
  return !!a && !!b;
});

const CLASSIC_COOLDOWN = Math.max(0, answerHeroes.length - 1);

function fnv1a(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
  }
  return h >>> 0;
}

function seededShuffle(seed, items) {
  const out = items.slice();
  let s = fnv1a(seed) || 1;
  for (let i = out.length - 1; i > 0; i--) {
    s = (s * 16807) % 2147483647;
    const j = s % (i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

function buildEpochList({
  seed,
  epoch,
  pool,
  epochSize,
  cooldownDays,
  getHeroKeys,
  crossModeKeysPerSlot,
  priorHistory = [],
}) {
  if (pool.length === 0) return [];
  const shuffled = seededShuffle(`${seed}:e${epoch}`, pool);
  const result = [];
  const placedKeys = [];
  let cursor = 0;
  for (let slot = 0; slot < epochSize; slot++) {
    const blockedRecent = new Set();
    const effectiveSlot = priorHistory.length + slot;
    const cooldownStart = Math.max(0, effectiveSlot - cooldownDays);
    for (let effI = cooldownStart; effI < effectiveSlot; effI++) {
      const src =
        effI < priorHistory.length
          ? priorHistory[effI]
          : placedKeys[effI - priorHistory.length];
      for (const k of src) blockedRecent.add(k);
    }
    const blockedCross = crossModeKeysPerSlot[slot] ?? new Set();
    const passes = [
      (keys) => keys.some((k) => blockedRecent.has(k) || blockedCross.has(k)),
      (keys) => keys.some((k) => blockedRecent.has(k)),
      () => false,
    ];
    let picked = null;
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

const heroKey = (h) => [h.key];

function legacyClassicKey(day) {
  return answerHeroes[fnv1a(`owdle:classic:${day}`) % answerHeroes.length].key;
}
function legacyAbilityKey(day) {
  return abilityPool[fnv1a(`owdle:ability:${day}`) % abilityPool.length].key;
}
function legacySplashKey(day) {
  return splashPool[fnv1a(`owdle:splash:${day}`) % splashPool.length].key;
}
function legacySoundKey(day) {
  if (labeledSoundKeys.length === 0) return null;
  return labeledSoundKeys[
    fnv1a(`owdle:sound:r8:${day}`) % labeledSoundKeys.length
  ];
}
function legacyQuoteKeys(day) {
  if (convPool.length === 0) return null;
  const c = convPool[fnv1a(`owdle:conversation:r2:${day}`) % convPool.length];
  return [c.speakers[0], c.speakers[1]];
}

function buildCutoverBootstrap(getKeys) {
  const out = [];
  for (let d = CUTOVER_BOOTSTRAP_DAYS; d >= 1; d--) {
    const day = indexToDayString(BAG_CUTOVER_INDEX - d);
    const keys = getKeys(day);
    out.push(new Set(keys ?? []));
  }
  return out;
}

function runEpoch(epoch) {
  const bootstrap = epoch === 0;
  const classic = buildEpochList({
    seed: "owdle:classic:bag",
    epoch,
    pool: answerHeroes,
    epochSize: EPOCH_SIZE,
    cooldownDays: CLASSIC_COOLDOWN,
    getHeroKeys: heroKey,
    crossModeKeysPerSlot: [],
    priorHistory: bootstrap
      ? buildCutoverBootstrap((d) => [legacyClassicKey(d)])
      : [],
  });
  const ability = buildEpochList({
    seed: "owdle:ability:bag",
    epoch,
    pool: abilityPool,
    epochSize: EPOCH_SIZE,
    cooldownDays: CONSTRAINED_COOLDOWN,
    getHeroKeys: heroKey,
    crossModeKeysPerSlot: classic.map((h) => new Set([h.key])),
    priorHistory: bootstrap
      ? buildCutoverBootstrap((d) => [legacyAbilityKey(d)])
      : [],
  });
  const splash = buildEpochList({
    seed: "owdle:splash:bag",
    epoch,
    pool: splashPool,
    epochSize: EPOCH_SIZE,
    cooldownDays: CONSTRAINED_COOLDOWN,
    getHeroKeys: heroKey,
    crossModeKeysPerSlot: classic.map(
      (h, i) => new Set([h.key, ability[i].key]),
    ),
    priorHistory: bootstrap
      ? buildCutoverBootstrap((d) => [legacySplashKey(d)])
      : [],
  });
  const sound = buildEpochList({
    seed: "owdle:sound:bag",
    epoch,
    pool: labeledSoundKeys,
    epochSize: EPOCH_SIZE,
    cooldownDays: CONSTRAINED_COOLDOWN,
    getHeroKeys: (k) => [k],
    crossModeKeysPerSlot: classic.map(
      (h, i) => new Set([h.key, ability[i].key, splash[i].key]),
    ),
    priorHistory: bootstrap
      ? buildCutoverBootstrap((d) => {
          const k = legacySoundKey(d);
          return k ? [k] : null;
        })
      : [],
  });
  const quote = buildEpochList({
    seed: "owdle:quote:bag",
    epoch,
    pool: convPool,
    epochSize: EPOCH_SIZE,
    cooldownDays: CONSTRAINED_COOLDOWN,
    getHeroKeys: (c) => [c.speakers[0], c.speakers[1]],
    crossModeKeysPerSlot: [],
    priorHistory: bootstrap
      ? buildCutoverBootstrap((d) => legacyQuoteKeys(d))
      : [],
  });
  return { classic, ability, splash, sound, quote };
}

// ─── Sub-puzzle resolvers (mirror lib/dailyBag.ts) ──────────────────────

function abilitySubOrder(epoch, hero) {
  const n = hero.abilities.length;
  if (n <= 1) return Array.from({ length: n }, (_, i) => i);
  return seededShuffle(
    `owdle:ability:sub:e${epoch}:${hero.key}`,
    Array.from({ length: n }, (_, i) => i),
  );
}

function soundSubOrder(epoch, hKey) {
  const clips = soundClips[hKey] ?? [];
  if (clips.length <= 1)
    return Array.from({ length: clips.length }, (_, i) => i);
  return seededShuffle(
    `owdle:sound:sub:e${epoch}:${hKey}`,
    Array.from({ length: clips.length }, (_, i) => i),
  );
}

function splashSkinOrder(epoch, hero) {
  const heroSkins = skins[hero.key] ?? [];
  if (heroSkins.length <= 1)
    return Array.from({ length: heroSkins.length }, (_, i) => i);
  return seededShuffle(
    `owdle:splash:skin:e${epoch}:${hero.key}`,
    Array.from({ length: heroSkins.length }, (_, i) => i),
  );
}

function splashPickForSlot(epoch, slot, list) {
  const hero = list[slot];
  const dayIdx = dayIndexForEpochSlot(epoch, slot);
  const heroSkins = skins[hero.key] ?? [];
  const useSkin =
    heroSkins.length > 0 &&
    fnv1a(`owdle:splash:variant:bag:d${dayIdx}`) % 100 < SPLASH_SKIN_PCT;
  if (!useSkin) return { kind: "default" };
  const order = splashSkinOrder(epoch, hero);
  let appearance = 0;
  for (let i = 0; i <= slot; i++) {
    if (list[i].key === hero.key) appearance++;
  }
  return { kind: "skin", index: order[(appearance - 1) % order.length] };
}

// ─── Constraint checks ──────────────────────────────────────────────────

function checkWithinModeCooldown(list, cooldown, label, keyOf) {
  const violations = [];
  for (let i = 0; i < list.length; i++) {
    const here = keyOf(list[i]);
    for (let j = Math.max(0, i - cooldown); j < i; j++) {
      const there = keyOf(list[j]);
      if (here.some((k) => there.includes(k))) {
        violations.push({ slotA: j, slotB: i, keys: here });
      }
    }
  }
  return { label, violations };
}

function checkCrossMode(classic, ability, splash, sound) {
  const violations = [];
  for (let i = 0; i < classic.length; i++) {
    const c = classic[i].key;
    const a = ability[i].key;
    const s = splash[i].key;
    const so = sound[i];
    if (a === c) violations.push({ slot: i, pair: "ability/classic", k: a });
    if (s === c) violations.push({ slot: i, pair: "splash/classic", k: s });
    if (s === a) violations.push({ slot: i, pair: "splash/ability", k: s });
    if (so === c) violations.push({ slot: i, pair: "sound/classic", k: so });
    if (so === a) violations.push({ slot: i, pair: "sound/ability", k: so });
    if (so === s) violations.push({ slot: i, pair: "sound/splash", k: so });
  }
  return violations;
}

function checkClassicFullCoverage(classic) {
  const seen = new Set(classic.map((h) => h.key));
  return {
    unique: seen.size,
    total: classic.length,
    poolSize: answerHeroes.length,
  };
}

function checkAbilityRotation(epoch, ability) {
  const violations = [];
  const lastAbilityByHero = new Map();
  const appearancesByHero = new Map();
  for (let i = 0; i < ability.length; i++) {
    const hero = ability[i];
    const count = (appearancesByHero.get(hero.key) ?? 0) + 1;
    appearancesByHero.set(hero.key, count);
    const order = abilitySubOrder(epoch, hero);
    const idx = order[(count - 1) % Math.max(1, order.length)];
    const prev = lastAbilityByHero.get(hero.key);
    if (prev != null && prev === idx && hero.abilities.length > 1) {
      violations.push({ slot: i, hero: hero.key, abilityIdx: idx });
    }
    lastAbilityByHero.set(hero.key, idx);
  }
  return violations;
}

function checkSplashRatio(epoch, splash) {
  let skinCount = 0;
  let defaultCount = 0;
  for (let i = 0; i < splash.length; i++) {
    const sub = splashPickForSlot(epoch, i, splash);
    if (sub.kind === "skin") skinCount++;
    else defaultCount++;
  }
  return {
    skinCount,
    defaultCount,
    skinPct: ((skinCount / (skinCount + defaultCount)) * 100).toFixed(1),
  };
}

// ─── Run ────────────────────────────────────────────────────────────────

console.log(
  `Pools: classic=${answerHeroes.length} ability=${abilityPool.length} splash=${splashPool.length} sound=${labeledSoundKeys.length} quote=${convPool.length}`,
);
console.log(
  `Cooldowns: classic=${CLASSIC_COOLDOWN}, constrained=${CONSTRAINED_COOLDOWN}, epoch=${EPOCH_SIZE}`,
);
console.log("");

function checkBootstrapRespected(list, getKey, legacyFn, cooldown, label) {
  const legacyTail = [];
  for (let d = CUTOVER_BOOTSTRAP_DAYS; d >= 1; d--) {
    const day = indexToDayString(BAG_CUTOVER_INDEX - d);
    const k = legacyFn(day);
    if (k != null) legacyTail.push(Array.isArray(k) ? k : [k]);
  }
  // The bootstrap should prevent any legacy-tail key from showing up in
  // the first N bag slots that fall within the cooldown window. For
  // Classic-style (cooldown >> 5) ALL 5 are blocked at slot 0. For
  // Ability-style (cooldown=3) only the last 3 of 5 are blocked at slot 0.
  const violations = [];
  const lookbackForSlot = (slot) =>
    Math.max(0, Math.min(CUTOVER_BOOTSTRAP_DAYS, cooldown - slot));
  for (let slot = 0; slot < CUTOVER_BOOTSTRAP_DAYS; slot++) {
    const lookback = lookbackForSlot(slot);
    if (lookback === 0) continue;
    const start = legacyTail.length - lookback;
    const blocked = new Set();
    for (let i = start; i < legacyTail.length; i++) {
      for (const k of legacyTail[i]) blocked.add(k);
    }
    const here = getKey(list[slot]);
    for (const k of (Array.isArray(here) ? here : [here])) {
      if (blocked.has(k)) violations.push({ slot, k });
    }
  }
  return { label, violations };
}

const allSkinPcts = [];
let allClean = true;

for (let epoch = 0; epoch < 4; epoch++) {
  const { classic, ability, splash, sound, quote } = runEpoch(epoch);

  const cClassic = checkWithinModeCooldown(
    classic,
    CLASSIC_COOLDOWN,
    "classic",
    (h) => [h.key],
  );
  const cAbility = checkWithinModeCooldown(
    ability,
    CONSTRAINED_COOLDOWN,
    "ability",
    (h) => [h.key],
  );
  const cSplash = checkWithinModeCooldown(
    splash,
    CONSTRAINED_COOLDOWN,
    "splash",
    (h) => [h.key],
  );
  const cSound = checkWithinModeCooldown(
    sound,
    CONSTRAINED_COOLDOWN,
    "sound",
    (k) => [k],
  );
  const cQuote = checkWithinModeCooldown(
    quote,
    CONSTRAINED_COOLDOWN,
    "quote",
    (c) => [c.speakers[0], c.speakers[1]],
  );

  const crossViolations = checkCrossMode(classic, ability, splash, sound);
  const classicCov = checkClassicFullCoverage(classic);
  const abilityRot = checkAbilityRotation(epoch, ability);
  const ratio = checkSplashRatio(epoch, splash);
  allSkinPcts.push(parseFloat(ratio.skinPct));

  let bootstrap = null;
  if (epoch === 0) {
    const bC = checkBootstrapRespected(
      classic,
      (h) => h.key,
      legacyClassicKey,
      CLASSIC_COOLDOWN,
      "classic",
    );
    const bA = checkBootstrapRespected(
      ability,
      (h) => h.key,
      legacyAbilityKey,
      CONSTRAINED_COOLDOWN,
      "ability",
    );
    const bSp = checkBootstrapRespected(
      splash,
      (h) => h.key,
      legacySplashKey,
      CONSTRAINED_COOLDOWN,
      "splash",
    );
    const bSo = checkBootstrapRespected(
      sound,
      (k) => k,
      legacySoundKey,
      CONSTRAINED_COOLDOWN,
      "sound",
    );
    const bQ = checkBootstrapRespected(
      quote,
      (c) => [c.speakers[0], c.speakers[1]],
      legacyQuoteKeys,
      CONSTRAINED_COOLDOWN,
      "quote",
    );
    bootstrap = [bC, bA, bSp, bSo, bQ];
  }

  const lines = [
    `epoch ${epoch}:`,
    `  classic cooldown=${CLASSIC_COOLDOWN}: ${cClassic.violations.length === 0 ? "OK" : "FAIL " + cClassic.violations.length}`,
    `  ability cooldown=3: ${cAbility.violations.length === 0 ? "OK" : "FAIL " + cAbility.violations.length}`,
    `  splash  cooldown=3: ${cSplash.violations.length === 0 ? "OK" : "FAIL " + cSplash.violations.length}`,
    `  sound   cooldown=3: ${cSound.violations.length === 0 ? "OK" : "FAIL " + cSound.violations.length}`,
    `  quote   cooldown=3 (either speaker): ${cQuote.violations.length === 0 ? "OK" : "FAIL " + cQuote.violations.length}`,
    `  cross-mode dedup: ${crossViolations.length === 0 ? "OK" : "FAIL " + crossViolations.length}`,
    `  classic coverage: ${classicCov.unique}/${classicCov.poolSize} heroes in 50 slots`,
    `  ability rotation (no back-to-back same ability): ${abilityRot.length === 0 ? "OK" : "FAIL " + abilityRot.length}`,
    `  splash skin/default: ${ratio.skinCount}/${ratio.defaultCount} (${ratio.skinPct}% skin)`,
  ];
  if (bootstrap) {
    for (const b of bootstrap) {
      lines.push(
        `  bootstrap (${b.label}, last ${CUTOVER_BOOTSTRAP_DAYS} legacy days respected): ${b.violations.length === 0 ? "OK" : "FAIL " + b.violations.length}`,
      );
      if (b.violations.length > 0) allClean = false;
    }
  }
  console.log(lines.join("\n"));
  if (
    cClassic.violations.length +
      cAbility.violations.length +
      cSplash.violations.length +
      cSound.violations.length +
      cQuote.violations.length +
      crossViolations.length +
      abilityRot.length >
    0
  )
    allClean = false;
}

const avgSkinPct =
  allSkinPcts.reduce((a, b) => a + b, 0) / allSkinPcts.length;
console.log("");
console.log(
  `Average splash skin% across 4 epochs: ${avgSkinPct.toFixed(1)}%  (target ≈ 80%)`,
);
console.log(allClean ? "\nALL CONSTRAINTS OK" : "\nVIOLATIONS DETECTED");
process.exit(allClean ? 0 : 1);
