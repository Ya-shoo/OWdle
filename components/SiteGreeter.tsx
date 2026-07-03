"use client";

// Mounts the mascot greeter in a page's top-right corner. Drop <SiteGreeter />
// on any route that should show it (home, classic, …). Fixed +
// pointer-events-none so only the mascot itself is interactive — nothing
// behind it is blocked.
//
// The announcement is fetched at runtime from /api/greeter (Discord-backed —
// functions/api/greeter.ts). We wait for that to resolve before mounting the
// greeter so AvatarGreeter sees the final message at mount (its seen-tracking
// + entrance key off the announcement id). On failure we fall back to a
// bundled greeting; a null result (the channel's `[off]` kill-switch) renders
// nothing.

import { useEffect, useState } from "react";
import { AvatarGreeter } from "./AvatarGreeter";
import { FALLBACK_GREETING, type GreeterAnnouncement } from "@/lib/greeter";
import { useRightRailVisible } from "@/lib/adRailSignal";
import { RAIL_INNER_FROM_CENTER_PX } from "@/components/AdRails";

// `next dev` has no Functions runtime, so in dev we hit the wrangler pages-dev
// helper that serves functions/ (the same :8799 the OG preview uses — keep the
// port in sync with scripts/og-dev-server.mjs and lib/shareLinks.ts).
const API_BASE =
  process.env.NODE_ENV === "development" ? "http://localhost:8799" : "";
const GREETER_API = `${API_BASE}/api/greeter`;

// When a right side-rail ad is showing, the greeter's whole corner (idle chip,
// wave, and the announcement bubble that fans out to its left) lands under the
// rail. Park its right edge just inside the rail's inner edge instead. The gap
// is constant across every viewport and tier because both the rail and the
// greeter anchor to 50%. Below the rail's min width no rail serves and the
// signal stays off, so the greeter keeps its normal top-right perch (right-20).
const GREETER_RAIL_CLEARANCE_PX = 24;
const GREETER_RIGHT_CLEAR_OF_RAIL = `calc(50% - ${
  RAIL_INNER_FROM_CENTER_PX - GREETER_RAIL_CLEARANCE_PX
}px)`;
const GREETER_RIGHT_DEFAULT = "5rem"; // Tailwind right-20

export function SiteGreeter() {
  const [state, setState] = useState<{
    done: boolean;
    announcement: GreeterAnnouncement | null;
  }>({ done: false, announcement: null });

  // Desktop-only for now — the mobile greeter UI is untested, so phones and
  // tablets neither fetch nor render it. Starts false (nothing shows on the
  // first client paint); the effect flips it once matchMedia resolves and on
  // any resize across the breakpoint.
  const [isDesktop, setIsDesktop] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1024px)");
    const sync = () => setIsDesktop(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  useEffect(() => {
    if (!isDesktop) return;
    const ctrl = new AbortController();
    const timeout = setTimeout(() => ctrl.abort(), 4000);
    // No custom headers — keeps it a "simple" cross-origin GET in dev (an
    // `accept` header would trip a CORS preflight the function doesn't answer).
    fetch(GREETER_API, { signal: ctrl.signal })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`status ${r.status}`))))
      .then((data: { announcement?: GreeterAnnouncement | null }) => {
        setState({ done: true, announcement: data?.announcement ?? null });
      })
      .catch(() => {
        // Endpoint unreachable (local dev without the helper, or transient) —
        // show the bundled greeting rather than nothing.
        setState({ done: true, announcement: FALLBACK_GREETING });
      })
      .finally(() => clearTimeout(timeout));
    return () => {
      clearTimeout(timeout);
      ctrl.abort();
    };
  }, [isDesktop]);

  // Shift clear of the right side-rail ad when one is actually on screen
  // (published by AdRails; false until a live unit fills or the dev preview
  // mock shows).
  const railVisible = useRightRailVisible();

  if (!isDesktop || !state.done || !state.announcement) return null;

  return (
    <div
      className="pointer-events-none fixed top-28 z-40 transition-[right] duration-500 ease-[cubic-bezier(0.22,1,0.36,1)]"
      style={{
        right: railVisible ? GREETER_RIGHT_CLEAR_OF_RAIL : GREETER_RIGHT_DEFAULT,
      }}
    >
      <AvatarGreeter announcement={state.announcement} apiBase={API_BASE} />
    </div>
  );
}
