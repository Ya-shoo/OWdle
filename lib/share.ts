import { HEROES_BY_KEY, type Hero } from "./heroes";
import { compareHero } from "./compare";

// Classic-mode emoji-grid share text, LoLdle-style: headline, then one
// 🟩🟨🟥 row per guess (latest first, so the winning all-green row
// leads), capped with a "+N more" line, then the share URL. The grid
// teases the path without spoiling the answer.
const MAX_GRID_ROWS = 5;

export function buildClassicShareText(opts: {
  // Hero keys, chronological (as stored in mode state).
  guesses: string[];
  answer: Hero;
  won: boolean;
  hints?: number;
  url: string;
}): string {
  const { guesses, answer, won, hints = 0, url } = opts;
  const rows = guesses
    .map((key) => HEROES_BY_KEY[key])
    .filter((h): h is Hero => Boolean(h))
    .map((hero) =>
      compareHero(hero, answer)
        .map((r) => {
          if (r.status === "correct") return "🟩";
          if (r.status === "partial") return "🟨";
          if (r.status === "far") return "🟥";
          return "⬛";
        })
        .join(""),
    )
    .reverse();
  const shown = rows.slice(0, MAX_GRID_ROWS);
  const hidden = rows.length - shown.length;

  const lines: string[] = [];
  const hintTag = hints > 0 ? ` (💡 ${hints})` : "";
  lines.push(
    won
      ? `I found today's #OWdle hero in Classic in ${guesses.length} ${
          guesses.length === 1 ? "guess" : "guesses"
        }${hintTag}:`
      : `Today's #OWdle Classic got me ❌${hintTag}:`,
  );
  lines.push(...shown);
  if (hidden > 0) lines.push(`➕ ${hidden} more`);
  lines.push(url);
  return lines.join("\n");
}
