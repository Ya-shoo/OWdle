"use client";

import { ReactNode } from "react";
import type { DailyModeResult } from "./ShareCard";
import { TextShareBlock } from "./TextShareBlock";
import { buildDailyShareText } from "@/lib/dailyShareText";
import { encodeResults } from "@/lib/shareUrl";
import { SITE_URL } from "@/lib/site";

// Daily-summary text share. Builds the LoLdle-style mode-by-mode block
// and the personalized /r/[code] unfurl link, then hands both to the
// shared TextShareBlock for display + the Copy action. The surface's
// link-first ShareButton passes through `share` into the block's
// action row — one share affordance per surface, at the bottom.
type Props = {
  day: string;
  results: DailyModeResult[];
  totalHints?: number;
  totalSkips?: number;
  share?: ReactNode;
};

export function DailyTextShare({
  day,
  results,
  totalHints = 0,
  totalSkips = 0,
  share,
}: Props) {
  // Personalized unfurl link — same /r/[code] route the image share
  // used. Filter pending entries (shouldn't exist post-completion but
  // the type allows them) so the code is well-formed.
  const url = (() => {
    const completed = results.filter((r) => r.outcome !== "pending") as {
      slug: DailyModeResult["slug"];
      outcome: "won" | "lost";
      guesses: number;
    }[];
    if (completed.length === 0) return SITE_URL;
    const { code } = encodeResults({
      day,
      results: completed,
      hints: totalHints,
      skips: totalSkips,
    });
    return `${SITE_URL}/r/${code}/`;
  })();

  const text = buildDailyShareText({
    day,
    results,
    totalHints,
    totalSkips,
    url,
  });

  return (
    <TextShareBlock
      text={text}
      surface="daily_complete"
      dailyId={day}
      share={share}
    />
  );
}
