"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { usePathname } from "next/navigation";
import { BUILT_MODE_SLUGS } from "@/lib/modes";
import { detectAdblock, type AdblockResult } from "@/lib/adblock";
import { trackAdInventory } from "@/lib/tracking";
import { AdSlot } from "@/components/AdSlot";
import { AD_UNITS, ADSENSE_ENABLED } from "@/lib/adUnits";

// Ghost ad rails — invisible measurement probes for the planned ad
// placements. Two inventory stacks, mutually exclusive per pageview:
//
//   • DESKTOP side rails (2–3 stacked units per gutter, nothing across the
//     top) — render EMPTY fixed-position slot containers in the left/right
//     gutters of the home + built-mode pages.
//   • MOBILE stack (everything a side rail can't serve — phones, tablets,
//     narrow desktop windows): a sticky bottom ANCHOR + IN-CONTENT 300×250
//     units placed down the scroll. Measured here too so the "what would
//     mobile earn" question stops being a model and becomes data.
//
// A pageview gets ONE or the OTHER: if the viewport is wide+tall enough for
// a side rail, that's its inventory; otherwise the mobile stack fills in.
// No double-serving, so `rail_tier === "none"` is exactly the mobile-stack
// population. Zero visual change in production; dev builds draw dashed
// outlines (rails in the gutters, a bar at the bottom for the anchor) so the
// layout can be eyeballed before any network script ever ships.
//
// Per pageview, the `ad_inventory` event answers the questions the ad-
// revenue model currently guesses at:
//   - rail_tier: which rail width fit this viewport (wide300 / narrow160 /
//     none) given the max-w-6xl content column
//   - slots_per_side: how many stacked units fit this viewport's HEIGHT —
//     1080p realistically fits one 300×600, tall monitors fit three units
//   - anchor_eligible / anchor_imps: would a mobile sticky anchor serve, and
//     how many viewable impressions it racks up over the visit (it's always
//     in view, so its whole-visit time IS its viewability)
//   - incontent_fit / incontent_viewed: how many in-content 300×250 units
//     the document is tall enough to hold, and how many the visitor actually
//     scrolled into view (a measured viewable count, not an assumption)
//   - mobile_imps_total: anchor + in-content, the mobile analog of
//     est_impressions_total
//   - visible_s → est_impressions_total: rails are position:fixed, so a
//     slot is viewable exactly while the tab is visible on this page; a
//     30s-refresh network turns that time into extra impressions (capped,
//     like real networks cap)
//   - adblock_cosmetic / adblock_network: the gamer-audience haircut
//
// Flushing: events are cumulative snapshots tagged pv_id + seq, sent on
// visibility loss, pagehide, and SPA route change (the first two via
// sendBeacon — they race tab teardown). A tab that's hidden and re-shown
// flushes again with bigger numbers, so dashboards take argMax(seq) per
// pv_id and never double-count. Ineligible viewports still send events
// (slots 0) — they're the denominator that tells us what fraction of
// traffic side rails can monetize at all.
//
// The tier is locked at pageview start: a pageview's inventory is what was
// available when the page rendered. Mid-view window resizes are rare and
// re-tiering would let one pv_id claim two different layouts. Scroll depth
// is the one thing that legitimately grows mid-view, so it's tracked live.
//
// This component ships near-IDENTICALLY in the Deadlockle repo (event +
// prop names exactly shared — DailyDles dashboards span both sites; `site`
// / `$host` split them). Fix bugs in lockstep.

// max-w-6xl (1152px) + px-6 (2×24px) → content footprint 1200px, half 600.
const CONTENT_HALF_PX = 600;
const RAIL_GAP_PX = 24; // breathing room between content edge and rail
const EDGE_MARGIN_PX = 16; // rail never pinned to the screen edge
const TOP_OFFSET_PX = 88; // clears the site header
const BOTTOM_MARGIN_PX = 24;
const SLOT_GAP_PX = 16;
// Simulated network behavior: viewability-gated 30s refresh, capped — one
// base impression + up to 9 refreshes per slot. Raw visible_s also ships,
// so analysis can re-derive impressions under different refresh rules.
const REFRESH_SECONDS = 30;
const MAX_REFRESHES_PER_SLOT = 9;

// Mobile stack geometry. The anchor is a single 320×50 sticky unit (the
// universally-allowed mobile leaderboard) — its height only drives the dev
// outline, never the impression count. In-content 300×250 units are
// simulated one per ~screenful of scroll below the fold, capped: a unit
// counts as a viewable impression only once the visitor scrolls its slot
// position into view, so incontent_viewed is measured behavior, not a guess.
const ANCHOR_W = 320;
const ANCHOR_H = 50;
const INCONTENT_FIRST_PX_FROM_VIEWPORT = 1; // first unit ≈ one screen down
const INCONTENT_SPACING_PX = 900;
const MAX_INCONTENT = 4;

type SlotSpec = { w: number; h: number };

type Tier = {
  name: "wide300" | "narrow160";
  railW: number;
  minViewportW: number;
  stack: SlotSpec[];
};

// Ordered widest-first; the first tier whose minViewportW fits wins.
// wide300 ≈ ≥1880px viewports, narrow160 ≈ ≥1600px — both derived from the
// geometry constants above rather than hand-picked breakpoints.
const TIERS: Tier[] = [
  {
    name: "wide300",
    railW: 300,
    minViewportW: 2 * (CONTENT_HALF_PX + RAIL_GAP_PX + 300 + EDGE_MARGIN_PX),
    stack: [
      { w: 300, h: 600 },
      { w: 300, h: 250 },
      { w: 300, h: 250 },
    ],
  },
  {
    name: "narrow160",
    railW: 160,
    minViewportW: 2 * (CONTENT_HALF_PX + RAIL_GAP_PX + 160 + EDGE_MARGIN_PX),
    stack: [
      { w: 160, h: 600 },
      { w: 160, h: 600 },
    ],
  },
];

type PageMeta = { pageType: "home" | "mode"; mode: string | null };

// Rails measure only the pages that would carry ads: home + built modes.
// Everything else (labeler, share shells) is out of scope — no probes, no
// events, so the denominators stay clean.
function pageMetaFor(pathname: string): PageMeta | null {
  const clean = pathname.replace(/\/+$/, "") || "/"; // trailingSlash: true
  if (clean === "/") return { pageType: "home", mode: null };
  const seg = clean.slice(1);
  return (BUILT_MODE_SLUGS as readonly string[]).includes(seg)
    ? { pageType: "mode", mode: seg }
    : null;
}

function pickTier(viewportW: number): Tier | null {
  return TIERS.find((t) => viewportW >= t.minViewportW) ?? null;
}

// Take stack units top-down while they fit the viewport height — this is
// what turns "2–3 per side" into per-visitor reality.
function fitStack(tier: Tier, viewportH: number): SlotSpec[] {
  const fitted: SlotSpec[] = [];
  let bottom = TOP_OFFSET_PX;
  for (const slot of tier.stack) {
    const next = bottom + (fitted.length > 0 ? SLOT_GAP_PX : 0) + slot.h;
    if (next > viewportH - BOTTOM_MARGIN_PX) break;
    fitted.push(slot);
    bottom = next;
  }
  return fitted;
}

// In-content 300×250 placement model for the mobile stack. Units sit at
// depths { viewportH, viewportH + spacing, viewportH + 2·spacing, … } down
// the document. A unit FITS if the document is tall enough to reach its slot
// position; it's VIEWED if the visitor actually scrolled that far. Returns
// both so dashboards see the ceiling (fit) and the realized impressions
// (viewed). maxScrollPx is the deepest pixel that entered the viewport
// (scrollY + viewportH).
function fitInContent(
  viewportH: number,
  docScrollH: number,
  maxScrollPx: number,
): { fit: number; viewed: number } {
  let fit = 0;
  let viewed = 0;
  for (let i = 0; i < MAX_INCONTENT; i++) {
    const pos =
      viewportH * INCONTENT_FIRST_PX_FROM_VIEWPORT + i * INCONTENT_SPACING_PX;
    if (pos > docScrollH) break;
    fit++;
    if (pos <= maxScrollPx) viewed++;
  }
  return { fit, viewed };
}

type PvState = {
  pvId: string;
  seq: number;
  startedAt: number;
  visibleMs: number; // closed visibility spans
  visibleSince: number | null; // open span start; null while tab hidden
  meta: PageMeta;
  tierName: "wide300" | "narrow160" | "none";
  slotsPerSide: number;
  slotSizes: string; // one side, e.g. "300x600+300x250"
  viewportW: number;
  viewportH: number;
  anchorEligible: boolean; // mobile stack serves (no side rail fit)
  maxScrollPx: number; // deepest pixel scrolled into view (scrollY + viewportH)
  docScrollH: number; // tallest document height seen this pageview
};

function newPvId(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return `pv-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  }
}

const DEV_SLOT_STYLE: CSSProperties = {
  border: "1px dashed rgba(150, 150, 170, 0.55)",
  background: "rgba(120, 120, 140, 0.06)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
};

const DEV_LABEL_STYLE: CSSProperties = {
  fontSize: 11,
  letterSpacing: "0.08em",
  color: "rgba(150, 150, 170, 0.8)",
  fontFamily: "var(--font-plex-mono), monospace",
};

type RenderState = {
  rails: { tier: Tier; slots: SlotSpec[] } | null;
  anchor: boolean;
};

export function AdRails() {
  const pathname = usePathname();
  // Derived synchronously so an ad-page → non-ad-page navigation hides the
  // probes on the SAME render (no stale rails) — which also keeps the effect
  // free of a cascading setGeom(null) just to clear them.
  const isAdPage = pageMetaFor(pathname ?? "/") !== null;
  const [geom, setGeom] = useState<RenderState | null>(null);
  // Dismiss state for the live mobile anchor (AdSense anchors must be
  // closeable). Session-scoped: once closed it stays closed across route
  // changes. Unused while ads are dormant.
  const [anchorClosed, setAnchorClosed] = useState(false);
  const adblockRef = useRef<AdblockResult>({ cosmetic: null, network: null });

  useEffect(() => {
    const meta = pageMetaFor(pathname ?? "/");
    if (!meta) return;

    const tier = pickTier(window.innerWidth);
    const slots = tier ? fitStack(tier, window.innerHeight) : [];
    const eligible = tier !== null && slots.length > 0;
    // Mobile stack serves exactly when a side rail could NOT — phones,
    // tablets, and desktop windows too narrow/short for a gutter unit.
    const anchorEligible = !eligible;
    setGeom({ rails: eligible ? { tier, slots } : null, anchor: anchorEligible });

    const pv: PvState = {
      pvId: newPvId(),
      seq: 0,
      startedAt: performance.now(),
      visibleMs: 0,
      visibleSince:
        document.visibilityState === "visible" ? performance.now() : null,
      meta,
      tierName: eligible ? tier.name : "none",
      slotsPerSide: slots.length,
      slotSizes: slots.map((s) => `${s.w}x${s.h}`).join("+"),
      viewportW: window.innerWidth,
      viewportH: window.innerHeight,
      anchorEligible,
      maxScrollPx: window.innerHeight, // first screen is viewed without scrolling
      docScrollH: document.documentElement.scrollHeight,
    };

    void detectAdblock().then((r) => {
      adblockRef.current = r;
    });

    const closeSpan = () => {
      if (pv.visibleSince != null) {
        pv.visibleMs += performance.now() - pv.visibleSince;
        pv.visibleSince = null;
      }
    };
    const openSpan = () => {
      if (pv.visibleSince == null && document.visibilityState === "visible") {
        pv.visibleSince = performance.now();
      }
    };

    // Scroll handler stays layout-read-free (no scrollHeight here — that
    // would force a reflow on every scroll tick and jank mobile). It only
    // touches cached scroll/size values; document height is sampled at flush.
    const onScroll = () => {
      const depth = window.scrollY + pv.viewportH;
      if (depth > pv.maxScrollPx) pv.maxScrollPx = depth;
    };

    const flush = (
      reason: "hidden" | "pagehide" | "route_change",
      beacon: boolean,
    ) => {
      const openMs =
        pv.visibleSince != null ? performance.now() - pv.visibleSince : 0;
      const visibleS = (pv.visibleMs + openMs) / 1000;

      // Desktop side rails.
      const slotsTotal = pv.slotsPerSide * 2;
      const impsPerSlot =
        slotsTotal === 0
          ? 0
          : 1 +
            Math.min(
              Math.floor(visibleS / REFRESH_SECONDS),
              MAX_REFRESHES_PER_SLOT,
            );

      // Mobile stack. Sample document height once here (flush is rare —
      // hidden/pagehide/route — so the one reflow is free). The anchor is a
      // single always-in-view slot, so it earns base + the same 30s-refresh
      // ladder over the visit; in-content units earn one viewable impression
      // each (no refresh — the visitor scrolls past them).
      pv.docScrollH = Math.max(
        pv.docScrollH,
        document.documentElement.scrollHeight,
      );
      const anchorImps = pv.anchorEligible
        ? 1 +
          Math.min(Math.floor(visibleS / REFRESH_SECONDS), MAX_REFRESHES_PER_SLOT)
        : 0;
      const inContent = pv.anchorEligible
        ? fitInContent(pv.viewportH, pv.docScrollH, pv.maxScrollPx)
        : { fit: 0, viewed: 0 };
      const mobileImpsTotal = anchorImps + inContent.viewed;

      pv.seq += 1;
      trackAdInventory(
        {
          pv_id: pv.pvId,
          seq: pv.seq,
          flush_reason: reason,
          page_type: pv.meta.pageType,
          mode: pv.meta.mode,
          rail_tier: pv.tierName,
          viewport_w: pv.viewportW,
          viewport_h: pv.viewportH,
          slots_per_side: pv.slotsPerSide,
          slots_total: slotsTotal,
          slot_sizes: pv.slotSizes,
          visible_s: Math.round(visibleS * 10) / 10,
          time_on_page_s:
            Math.round((performance.now() - pv.startedAt) / 100) / 10,
          est_impressions_total: slotsTotal * impsPerSlot,
          // Mobile stack (mutually exclusive with side rails — all 0 when a
          // side rail served, i.e. rail_tier !== "none").
          anchor_eligible: pv.anchorEligible,
          anchor_imps: anchorImps,
          doc_scroll_h: Math.round(pv.docScrollH),
          max_scroll_px: Math.round(pv.maxScrollPx),
          incontent_fit: inContent.fit,
          incontent_viewed: inContent.viewed,
          mobile_imps_total: mobileImpsTotal,
          adblock_cosmetic: adblockRef.current.cosmetic,
          adblock_network: adblockRef.current.network,
        },
        { beacon },
      );
    };

    const onPageHide = () => {
      closeSpan();
      flush("pagehide", true);
    };
    const onVisibility = () => {
      if (document.visibilityState === "hidden") {
        closeSpan();
        flush("hidden", true);
      } else {
        openSpan();
      }
    };

    window.addEventListener("pagehide", onPageHide);
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("scroll", onScroll, { passive: true });

    return () => {
      window.removeEventListener("pagehide", onPageHide);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("scroll", onScroll);
      closeSpan();
      flush("route_change", false);
    };
  }, [pathname]);

  if (!isAdPage || !geom) return null;

  const isDev = process.env.NODE_ENV === "development";
  // A unit goes "live" only when ads are armed (prod build + a set
  // ADSENSE_CLIENT) AND that specific unit has a provisioned slotId. So during
  // the verification phase — client set for AdSense to review, but no ad units
  // created yet — the loader script ships (components/GoogleAdsense.tsx) while
  // these rails/anchor stay invisible probes exactly as before: no empty ad
  // frames, no orphan close button. Going live flips a container to clickable
  // + non-aria-hidden.
  const anchorLive =
    ADSENSE_ENABLED && AD_UNITS.mobile_anchor.slotId !== "";

  return (
    <>
      {geom.rails
        ? (["left", "right"] as const).map((side) => {
            // Symmetric: each rail's outer edge sits CONTENT_HALF + GAP +
            // railW from center; tier gating guarantees that's ≥ EDGE_MARGIN
            // from the screen edge.
            const offset =
              CONTENT_HALF_PX + RAIL_GAP_PX + geom.rails!.tier.railW;
            const railUnit =
              side === "left" ? AD_UNITS.rail_left : AD_UNITS.rail_right;
            const railLive = ADSENSE_ENABLED && railUnit.slotId !== "";
            return (
              <div
                key={side}
                aria-hidden={railLive ? undefined : true}
                // z-10: under the header (z-50) and any modal. pointer-events-
                // none only while it's an invisible probe — a live ad must be
                // clickable.
                className={`fixed z-10 hidden lg:block${
                  railLive ? "" : " pointer-events-none"
                }`}
                style={{ top: TOP_OFFSET_PX, [side]: `calc(50% - ${offset}px)` }}
              >
                {geom.rails!.slots.map((slot, i) => (
                  <div
                    key={i}
                    data-rail-slot={`${side}_${i}`}
                    style={{
                      width: slot.w,
                      height: slot.h,
                      marginTop: i > 0 ? SLOT_GAP_PX : 0,
                      ...(isDev ? DEV_SLOT_STYLE : undefined),
                    }}
                  >
                    {railLive && i === 0 ? (
                      // Launch fills only the top gutter slot; deeper slots
                      // stay measured-but-unfilled until Phase 2.
                      <AdSlot slotId={railUnit.slotId} w={slot.w} h={slot.h} />
                    ) : isDev ? (
                      <span style={DEV_LABEL_STYLE}>
                        ghost {slot.w}×{slot.h}
                      </span>
                    ) : null}
                  </div>
                ))}
              </div>
            );
          })
        : null}

      {geom.anchor && !(anchorLive && anchorClosed) ? (
        <div
          aria-hidden={anchorLive ? undefined : true}
          data-mobile-anchor
          // Driven by the eligibility flag, NOT a CSS breakpoint: the anchor
          // serves on every viewport a side rail couldn't (incl. narrow
          // desktop). pointer-events-none only while it's an invisible probe.
          className={`fixed inset-x-0 bottom-0 z-10 flex justify-center${
            anchorLive ? "" : " pointer-events-none"
          }`}
        >
          <div
            style={{
              position: "relative",
              width: ANCHOR_W,
              height: ANCHOR_H,
              ...(isDev ? DEV_SLOT_STYLE : undefined),
            }}
          >
            {anchorLive ? (
              <>
                <button
                  type="button"
                  aria-label="Close ad"
                  onClick={() => setAnchorClosed(true)}
                  className="pointer-events-auto"
                  style={{
                    position: "absolute",
                    top: -18,
                    right: 0,
                    width: 18,
                    height: 18,
                    lineHeight: "16px",
                    fontSize: 12,
                    border: "none",
                    borderRadius: "4px 4px 0 0",
                    background: "rgba(10,14,20,0.85)",
                    color: "rgba(230,230,240,0.9)",
                    cursor: "pointer",
                  }}
                >
                  ✕
                </button>
                <AdSlot
                  slotId={AD_UNITS.mobile_anchor.slotId}
                  w={ANCHOR_W}
                  h={ANCHOR_H}
                />
              </>
            ) : isDev ? (
              <span style={DEV_LABEL_STYLE}>
                ghost anchor {ANCHOR_W}×{ANCHOR_H}
              </span>
            ) : null}
          </div>
        </div>
      ) : null}
    </>
  );
}
