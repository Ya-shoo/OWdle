import type { ModeSlug } from "./modes";

// LoLdle-style copyable results text for the daily summary. Plain
// strings travel friction-free — they paste cleanly into Discord /
// iMessage / group chats, and the trailing /r/[code] link still unfurls
// the per-player card image where platforms support previews.

// Emoji prefix per mode line. Picked for instant mode recognition at
// text size; overlap with other -dle games' vocabularies (❓ classic,
// 💬 quote) is a feature — players already read that language.
const MODE_EMOJI: Record<ModeSlug, string> = {
  classic: "❓",
  quote: "💬",
  splash: "🎨",
  sound: "🔊",
  ability: "⚡",
  map: "🗺️",
};

// Display labels for the text lines (matches the share cards' MODE_LABEL
// — "Spotlight" for the splash slug, etc.).
const MODE_TEXT_LABEL: Record<ModeSlug, string> = {
  classic: "Classic",
  quote: "Quote",
  splash: "Spotlight",
  sound: "Sound",
  ability: "Ability",
  map: "Map",
};

export function buildDailyShareText(opts: {
  day: string;
  results: {
    slug: ModeSlug;
    outcome: "won" | "lost" | "pending";
    guesses: number;
  }[];
  totalHints?: number;
  totalSkips?: number;
  // Share link appended as the last line — typically the personalized
  // /r/[code] unfurl URL.
  url: string;
}): string {
  const { day, results, totalHints = 0, totalSkips = 0, url } = opts;
  const played = results.filter((r) => r.outcome !== "pending");
  const totalGuesses = played.reduce((sum, r) => sum + r.guesses, 0);

  const lines: string[] = [];
  lines.push(
    `I've completed all ${played.length} modes of #OWdle today (${formatTextDate(day)}):`,
  );
  for (const r of played) {
    lines.push(
      `${MODE_EMOJI[r.slug]} ${MODE_TEXT_LABEL[r.slug]}: ${r.guesses}${
        r.outcome === "lost" ? " ❌" : ""
      }`,
    );
  }
  const tally = [
    `${totalGuesses} guess${totalGuesses === 1 ? "" : "es"} total`,
  ];
  if (totalHints > 0) {
    tally.push(`${totalHints} hint${totalHints === 1 ? "" : "s"}`);
  }
  if (totalSkips > 0) {
    tally.push(`${totalSkips} skip${totalSkips === 1 ? "" : "s"}`);
  }
  lines.push(tally.join(" · "));
  lines.push(url);
  return lines.join("\n");
}

// Same locale-aware month/day/year as the share cards' date stamp.
function formatTextDate(day: string): string {
  const [y, m, d] = day.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.toLocaleDateString(undefined, {
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}
