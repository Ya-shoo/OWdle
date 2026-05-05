import heroesData from "@/data/heroes.json";
import skinsData from "@/data/skins.json";

export type Role = "tank" | "damage" | "support";
export type Species = "human" | "omnic" | "cyborg" | "animal" | "ai";
export type Gender = "female" | "male" | "non-binary" | "neutral";
export type Rarity = "epic" | "legendary" | "mythic";

export type Ability = {
  name: string;
  description: string | null;
  icon: string;
  // MP4 with audio track for the ability animation (Akamai). Kept as a
  // backup; not used at runtime since the audio track is unreliable across
  // browsers when the container also carries video.
  videoUrl?: string | null;
  // Self-hosted MP3 extracted at build time via scripts/extract-audio.mjs.
  // null when the source MP4 had no decodable audio.
  audioUrl?: string | null;
};

// Self-hosted 800×800 character square scraped from the Overwatch Fandom
// wiki via scripts/build-skins.mjs. Filtered to Epic + Legendary tiers.
export type Skin = {
  key: string;
  name: string;
  rarity: Rarity;
  file: string;
};

export type Hero = {
  key: string;
  name: string;
  role: Role;
  subrole: string | null;
  gamemodes: string[];
  portrait: string;
  location: string | null;
  country: string | null;
  continent: string | null;
  age: number | null;
  hp: number | null;
  birthday: string | null;
  birthday_month: string | null;
  species: Species | null;
  gender: Gender | null;
  release_year: number | null;
  abilities: Ability[];
  backgrounds: string[];
  // Self-hosted square crop centered on the character via smartcrop saliency.
  // null only for heroes whose splash failed to process.
  splash_url: string | null;
  skins: Skin[];
};

const SKINS = skinsData as Record<string, Skin[]>;

export const HEROES: Hero[] = (heroesData as Omit<Hero, "skins">[]).map((h) => ({
  ...h,
  skins: SKINS[h.key] ?? [],
}));

export const HEROES_BY_KEY: Record<string, Hero> = Object.fromEntries(
  HEROES.map((h) => [h.key, h]),
);

// Heroes with complete attribute data — eligible to be the daily answer.
// Heroes missing overlay (new/experimental) still appear in autocomplete.
export const ANSWER_POOL: Hero[] = HEROES.filter(
  (h) =>
    h.role &&
    h.species != null &&
    h.gender != null &&
    h.release_year != null &&
    h.country != null &&
    h.continent != null &&
    h.age != null &&
    h.hp != null,
);
