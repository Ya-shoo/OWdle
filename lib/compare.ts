import type { Hero } from "./heroes";

export type AttrKey =
  | "role"
  | "country"
  | "continent"
  | "species"
  | "gender"
  | "age"
  | "release_year"
  | "hp";

export type TileStatus = "correct" | "partial" | "far" | "wrong";
export type Hint = "higher" | "lower" | null;

export type AttrResult = {
  attr: AttrKey;
  label: string;
  display: string;
  status: TileStatus;
  hint: Hint;
};

export const ATTRIBUTES: { key: AttrKey; label: string }[] = [
  { key: "role", label: "Role" },
  { key: "country", label: "Origin" },
  { key: "continent", label: "Continent" },
  { key: "species", label: "Species" },
  { key: "gender", label: "Gender" },
  { key: "age", label: "Age" },
  { key: "release_year", label: "Year" },
  { key: "hp", label: "HP" },
];

// Thresholds within which a numerical mismatch counts as "close" (yellow)
// instead of "far" (red). Calibrated to Overwatch's value distributions.
const NEAR_THRESHOLDS: Record<"age" | "hp" | "release_year", number> = {
  age: 5,
  hp: 50,
  release_year: 1,
};

function fmtCategorical(v: string | null): string {
  if (v == null) return "?";
  return v
    .split(" ")
    .map((w) =>
      w
        .split("-")
        .map((p) => p[0]?.toUpperCase() + p.slice(1))
        .join("-"),
    )
    .join(" ");
}

function fmtNumber(v: number | null): string {
  return v == null ? "?" : `${v}`;
}

function categorical(
  guessVal: string | null,
  answerVal: string | null,
): TileStatus {
  if (guessVal == null) return "wrong";
  return guessVal === answerVal ? "correct" : "wrong";
}

function numerical(
  guessVal: number | null,
  answerVal: number | null,
  nearThreshold: number,
): { status: TileStatus; hint: Hint } {
  if (guessVal == null || answerVal == null) {
    return { status: "wrong", hint: null };
  }
  if (guessVal === answerVal) return { status: "correct", hint: null };
  const diff = Math.abs(guessVal - answerVal);
  const status: TileStatus = diff <= nearThreshold ? "partial" : "far";
  const hint: Hint = guessVal < answerVal ? "higher" : "lower";
  return { status, hint };
}

export function compareHero(guess: Hero, answer: Hero): AttrResult[] {
  const out: AttrResult[] = [];

  out.push({
    attr: "role",
    label: "Role",
    display: fmtCategorical(guess.role),
    status: categorical(guess.role, answer.role),
    hint: null,
  });

  // Country gets continent partial-match (yellow) when country differs.
  let countryStatus: TileStatus = categorical(guess.country, answer.country);
  if (
    countryStatus === "wrong" &&
    guess.continent &&
    guess.continent === answer.continent
  ) {
    countryStatus = "partial";
  }
  out.push({
    attr: "country",
    label: "Origin",
    display: fmtCategorical(guess.country),
    status: countryStatus,
    hint: null,
  });

  out.push({
    attr: "continent",
    label: "Continent",
    display: fmtCategorical(guess.continent),
    status: categorical(guess.continent, answer.continent),
    hint: null,
  });

  out.push({
    attr: "species",
    label: "Species",
    display: fmtCategorical(guess.species),
    status: categorical(guess.species, answer.species),
    hint: null,
  });

  out.push({
    attr: "gender",
    label: "Gender",
    display: fmtCategorical(guess.gender),
    status: categorical(guess.gender, answer.gender),
    hint: null,
  });

  const ageR = numerical(guess.age, answer.age, NEAR_THRESHOLDS.age);
  out.push({
    attr: "age",
    label: "Age",
    display: fmtNumber(guess.age),
    status: ageR.status,
    hint: ageR.hint,
  });

  const yearR = numerical(
    guess.release_year,
    answer.release_year,
    NEAR_THRESHOLDS.release_year,
  );
  out.push({
    attr: "release_year",
    label: "Year",
    display: fmtNumber(guess.release_year),
    status: yearR.status,
    hint: yearR.hint,
  });

  const hpR = numerical(guess.hp, answer.hp, NEAR_THRESHOLDS.hp);
  out.push({
    attr: "hp",
    label: "HP",
    display: fmtNumber(guess.hp),
    status: hpR.status,
    hint: hpR.hint,
  });

  return out;
}

export function isWin(results: AttrResult[]): boolean {
  return results.every((r) => r.status === "correct");
}
