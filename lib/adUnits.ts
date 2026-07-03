import { ADSENSE_CLIENT, ADSENSE_APPROVED } from "@/lib/site";

// AdSense unit catalog — the single source of truth mapping the ghost
// AdRails geometry (components/AdRails.tsx) onto real AdSense units. Auto ads
// stay OFF in the AdSense dashboard; every unit below is placed by us, so the
// side-rails-only desktop layout and the mobile anchor/in-content stack ship
// exactly as instrumented — nothing Google injects on its own.
//
// Arming: everything stays inert until ADSENSE_ENABLED — a production build
// AND a non-empty ADSENSE_CLIENT AND ADSENSE_APPROVED (the approval gate in
// lib/site.ts, flipped true only once AdSense clears the site to serve). Until
// then AdRails renders its usual dev outlines / prod-nothing and keeps its
// ad_inventory measurement running untouched; zero ad markup ships.
//
// The approval gate is what makes wiring slotIds ahead of approval safe: a real
// slotId no longer arms a unit by itself (that shipped empty white rails during
// the review window — Google reserves the box but has nothing approved to fill,
// and the collapse-on-unfilled net doesn't fire reliably pre-approval). Units
// go live only when Google actually will serve. See ADSENSE_APPROVED.
//
// slotId: each unit's numeric data-ad-slot from the AdSense dashboard. An empty
// slotId still means "not created yet" and AdSlot renders nothing for it — so
// units can be wired into the layout now and, once ADSENSE_APPROVED flips, light
// up one at a time as they're provisioned.
//
// Ships near-identically in the Deadlockle repo — keep unit roles/sizes in
// lockstep; only the ids differ per site.

export const ADSENSE_ENABLED =
  process.env.NODE_ENV === "production" &&
  ADSENSE_CLIENT !== "" &&
  ADSENSE_APPROVED;

export type AdUnit = {
  key: string;
  slotId: string; // AdSense data-ad-slot (numeric); "" until created
  role: "rail" | "anchor" | "incontent";
  sizes: number[][]; // allowed [w, h] sizes, largest-first (declarative)
  serves: "desktop_rail" | "mobile_stack";
  fluid?: boolean; // in-article/fluid rendering (ignores fixed w/h)
};

type AdUnitKey = "rail_left" | "rail_right" | "mobile_anchor" | "incontent_1";

// Annotated Record (not `satisfies`) so each slotId keeps the `string` type
// from AdUnit — otherwise the literal "" narrows and `slotId !== ""` in AdRails
// becomes a no-overlap TS error the instant a real id is pasted in. The finite
// AdUnitKey union still gives exact, undefined-free dot access (AD_UNITS.rail_left).
export const AD_UNITS: Record<AdUnitKey, AdUnit> = {
  // ── Desktop side rails · rail_tier !== "none" (viewport ≥ 1600px) ──
  // Top gutter slot only at launch: 300×600 on wide300 (≥1880px), 160×600 on
  // narrow160 (≥1600px). The stacked 300×250s the ghost model permits on tall
  // monitors are deferred (see the Phase 2 note at the bottom).
  rail_left: {
    key: "rail_left",
    slotId: "3429147103",
    role: "rail",
    sizes: [
      [300, 600],
      [160, 600],
    ],
    serves: "desktop_rail",
  },
  rail_right: {
    key: "rail_right",
    slotId: "3004429674",
    role: "rail",
    sizes: [
      [300, 600],
      [160, 600],
    ],
    serves: "desktop_rail",
  },

  // ── Mobile stack · rail_tier === "none" (phones + windows < 1600px) ──
  // Sticky bottom leaderboard; always in view, so its whole-visit time is its
  // viewability. Rendered dismissible in AdRails (AdSense requires closeable
  // anchor ads).
  mobile_anchor: {
    key: "mobile_anchor",
    slotId: "6320858157",
    role: "anchor",
    sizes: [
      [320, 50],
      [728, 90],
    ],
    serves: "mobile_stack",
  },
  // In-article rectangle for below the result card (~1 screen down). NOT yet
  // inserted into the mode content flow — the ghost models it via scroll math
  // only; giving it a real home is the fast-follow. Defined here so its id
  // exists the moment we wire it.
  incontent_1: {
    key: "incontent_1",
    slotId: "",
    role: "incontent",
    sizes: [
      [300, 250],
      [336, 280],
    ],
    serves: "mobile_stack",
    fluid: true,
  },
};

// ── Phase 2 (deferred) ─────────────────────────────────────────────────────
// Stacked rectangles for the ~22% of eligible desktops tall enough for a 2nd/
// 3rd gutter unit (wide300 only). Add rail_left_2 / rail_right_2 with sizes
// [[300, 250]] and render them for slot indexes > 0 in AdRails once the
// tall-viewport share justifies the extra density.
