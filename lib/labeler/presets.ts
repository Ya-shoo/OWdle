import { HEROES } from "@/lib/heroes";

// Hand-authored extra labels beyond the 4 press-kit abilities — common
// gameplay variants (scoped fire, reload, mode toggles, etc.) that have
// distinctive sounds worth labeling separately. Add to this list as you
// discover other recognizable variants while recording.
const EXTRA_LABELS: Record<string, string[]> = {
  ana: ["Scoped Fire", "Reload"],
  ashe: ["Scoped Fire", "Reload"],
  bastion: ["Configuration: Assault", "Reconfigure"],
  cassidy: ["Fan the Hammer", "Reload"],
  dva: ["Defense Matrix", "Boosters", "Eject"],
  echo: ["Sticky Bombs", "Glide"],
  genji: ["Deflect", "Dash"],
  hanzo: ["Wall Climb", "Storm Arrows"],
  hazard: ["Jagged Wall"],
  junkrat: ["Concussion Mine"],
  juno: ["Glide Boost", "Pulsar Torpedoes"],
  kiriko: ["Swift Step", "Wall Climb"],
  lifeweaver: ["Petal Platform", "Thorn Volley"],
  mauga: ["Overrun", "Cardiac Overdrive"],
  mei: ["Cryo-Freeze"],
  mercy: ["Guardian Angel", "Resurrect"],
  moira: ["Fade"],
  orisa: ["Javelin Spin", "Energy Javelin"],
  pharah: ["Concussive Blast", "Hover Jets"],
  ramattra: ["Nemesis Form"],
  reaper: ["Wraith Form", "Shadow Step", "Reload"],
  reinhardt: ["Charge", "Fire Strike"],
  roadhog: ["Take a Breather", "Chain Hook", "Reload"],
  sigma: ["Kinetic Grasp", "Accretion"],
  sojourn: ["Power Slide", "Disruptor Shot"],
  soldier: ["Sprint", "Helix Rockets"],
  sombra: ["Translocator", "Hack", "Stealth"],
  symmetra: ["Sentry Turret", "Teleporter"],
  torbjorn: ["Deploy Turret", "Overload"],
  tracer: ["Recall"],
  widowmaker: ["Scoped Fire", "Grappling Hook"],
  winston: ["Jump Pack"],
  wreckingball: ["Grappling Claw", "Roll", "Adaptive Shield"],
  zarya: ["Particle Barrier", "Projected Barrier"],
  zenyatta: ["Orb of Harmony", "Orb of Discord"],
};

// Universal extras anyone might want regardless of hero.
const UNIVERSAL_EXTRAS = ["Quick Melee", "Jump", "Reload"];

export function getPresets(heroKey: string): string[] {
  const hero = HEROES.find((h) => h.key === heroKey);
  if (!hero) return [];
  const base = hero.abilities.map((a) => a.name);
  const extras = EXTRA_LABELS[heroKey] ?? [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const label of [...base, ...extras]) {
    const k = label.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(label);
  }
  return out;
}

export function getUniversalExtras(heroKey: string): string[] {
  const presets = new Set(getPresets(heroKey).map((s) => s.toLowerCase()));
  return UNIVERSAL_EXTRAS.filter((l) => !presets.has(l.toLowerCase()));
}

// Convert a label like "Scoped Fire" → "scoped-fire" for use as a filename.
export function slugify(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-+/g, "-");
}
