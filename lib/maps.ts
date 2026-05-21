import mapsData from "@/data/maps.json";

export type Gamemode =
  | "assault"
  | "hybrid"
  | "escort"
  | "control"
  | "push"
  | "flashpoint"
  | "clash";

export type MapDef = {
  key: string;
  label: string;
  location: string;
  gamemode: Gamemode;
  overheadFile: string | null;
  source?: string;
  sourceUrl?: string;
  attribution?: string;
  fetchedAt?: string;
};

export const MAPS: MapDef[] = mapsData as MapDef[];

export function getMap(key: string): MapDef | null {
  return MAPS.find((m) => m.key === key) ?? null;
}
