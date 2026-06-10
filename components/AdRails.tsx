"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { usePathname } from "next/navigation";
import { BUILT_MODE_SLUGS } from "@/lib/modes";
import { detectAdblock, type AdblockResult } from "@/lib/adblock";
import { trackAdInventory } from "@/lib/tracking";

// Ghost ad rails — invisible measurement probes for the planned side-rail
// ad placements (2–3 stacked units per gutter, desktop only, nothing
// across the top). Renders EMPTY fixed-position slot containers in the
// left/right gutters of the home page and built mode pages, then reports
// what real ads in those exact positions would have served. Zero visual
// change in production; dev builds draw dashed outlines so the layout can
// be eyeballed before any network script ever ships.
//
// Per pageview, the `ad_inventory` event answers the questions the ad-
// revenue model currently guesses at:
//   - rail_tier: which rail width fit this viewport (wide300 / narrow160 /
//     none) given the max-w-6xl content column
//   - slots_per_side: how many stacked units fit this viewport's HEIGHT —
//     1080p realistically fits one 300×600, tall monitors fit three units
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
// re-tiering would let one pv_id claim two different layouts.
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

export function AdRails() {
  const pathname = usePathname();
  const [render, setRender] = useState<{ tier: Tier; slots: SlotSpec[] } | null>(
    null,
  );
  const adblockRef = useRef<AdblockResult>({ cosmetic: null, network: null });

  useEffect(() => {
    const meta = pageMetaFor(pathname ?? "/");
    if (!meta) {
      setRender(null);
      return;
    }

    const tier = pickTier(window.innerWidth);
    const slots = tier ? fitStack(tier, window.innerHeight) : [];
    const eligible = tier !== null && slots.length > 0;
    setRender(eligible ? { tier, slots } : null);

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

    const flush = (
      reason: "hidden" | "pagehide" | "route_change",
      beacon: boolean,
    ) => {
      const openMs =
        pv.visibleSince != null ? performance.now() - pv.visibleSince : 0;
      const visibleS = (pv.visibleMs + openMs) / 1000;
      const slotsTotal = pv.slotsPerSide * 2;
      const impsPerSlot =
        slotsTotal === 0
          ? 0
          : 1 +
            Math.min(
              Math.floor(visibleS / REFRESH_SECONDS),
              MAX_REFRESHES_PER_SLOT,
            );
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

    return () => {
      window.removeEventListener("pagehide", onPageHide);
      document.removeEventListener("visibilitychange", onVisibility);
      closeSpan();
      flush("route_change", false);
    };
  }, [pathname]);

  if (!render) return null;

  const { tier, slots } = render;
  // Symmetric: each rail's outer edge sits CONTENT_HALF + GAP + railW from
  // center; tier gating guarantees that's ≥ EDGE_MARGIN from the screen edge.
  const offset = CONTENT_HALF_PX + RAIL_GAP_PX + tier.railW;
  const isDev = process.env.NODE_ENV === "development";

  return (
    <>
      {(["left", "right"] as const).map((side) => (
        <div
          key={side}
          aria-hidden
          // z-10: under the header (z-50) and any modal; pointer-events-none
          // so an invisible probe can never swallow a click.
          className="pointer-events-none fixed z-10 hidden lg:block"
          style={{ top: TOP_OFFSET_PX, [side]: `calc(50% - ${offset}px)` }}
        >
          {slots.map((slot, i) => (
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
              {isDev ? (
                <span style={DEV_LABEL_STYLE}>
                  ghost {slot.w}×{slot.h}
                </span>
              ) : null}
            </div>
          ))}
        </div>
      ))}
    </>
  );
}
