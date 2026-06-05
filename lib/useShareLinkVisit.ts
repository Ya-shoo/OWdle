"use client";

// Inbound half of the share funnel. /r/[code] redirects humans to the
// home page (daily codes) or the shared mode's page (round codes) with
// ?c=<code> appended; this hook reports the landing to PostHog and then
// strips the param so a reload doesn't double-count. The param is
// otherwise inert today — it's also the forward-compat slot for a
// "beat their score" challenge banner, which can decode the same code
// without any URL contract change.

import { useEffect } from "react";
import { decodeResults, decodeRoundResult } from "./shareUrl";
import { trackShareLinkVisited } from "./tracking";

export function useShareLinkVisit(landingMode: string): void {
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get("c");
    if (!code) return;

    const round = decodeRoundResult(code);
    const daily = round ? null : decodeResults(code);
    if (round) {
      trackShareLinkVisited({
        landingMode,
        code,
        sharedDate: round.date,
        sharedMode: round.slug,
        sharedOutcome: round.outcome,
      });
    } else if (daily) {
      trackShareLinkVisited({
        landingMode,
        code,
        sharedDate: daily.date,
      });
    } else {
      // Garbage param — leave the URL alone and report nothing.
      return;
    }

    params.delete("c");
    const qs = params.toString();
    window.history.replaceState(
      null,
      "",
      window.location.pathname + (qs ? `?${qs}` : "") + window.location.hash,
    );
  }, [landingMode]);
}
