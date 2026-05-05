import { HEROES_BY_KEY, type Hero } from "./heroes";
import { compareHero } from "./compare";

export function buildShareText(opts: {
  modeLabel: string;
  day: string;
  guesses: string[];
  answer: Hero;
  // Optional headline before the grid: "Ana's 'Biotic Rifle' in 4"
  headline?: string;
}): string {
  const lines: string[] = [];
  lines.push(`OWdle ${opts.modeLabel} · ${opts.day}`);
  lines.push(
    opts.headline
      ? `${opts.headline} in ${opts.guesses.length}`
      : `Solved in ${opts.guesses.length}`,
  );
  lines.push("");
  for (const key of opts.guesses) {
    const hero = HEROES_BY_KEY[key];
    if (!hero) continue;
    const results = compareHero(hero, opts.answer);
    const row = results
      .map((r) => {
        if (r.status === "correct") return "🟩";
        if (r.status === "partial") return "🟨";
        if (r.status === "far") return "🟥";
        return "⬛";
      })
      .join("");
    lines.push(row);
  }
  return lines.join("\n");
}
