"use client";

import { useEffect, useState } from "react";
import { AdSlot } from "./AdSlot";
import { ADSENSE_ENABLED, AD_UNITS } from "@/lib/adUnits";

// In-content ad placement — a responsive in-article rectangle dropped straight
// into the content flow (below a mode's result card; between homepage
// sections). Companion to the fixed side-rails/anchor in AdRails.tsx, for the
// in-flow slots the rails can't cover (and the only real display inventory on
// mobile, which has no gutters).
//
// Behavior mirrors AdRails, so one toggle drives everything:
//   • dev + ?adpreview=1  → a MockAd "creative" (hatch + "Advertisement" +
//     size), reading the SAME sessionStorage `adpreview` flag AdRails sets, so
//     turning preview on lights up rails AND in-content together.
//   • dev, no preview     → nothing (keeps normal dev browsing uncluttered).
//   • prod                → the real fluid AdSlot, but ONLY once ADSENSE_ENABLED
//     and the unit has a provisioned slotId. Until then: nothing ships.
//
// Uses the fluid `incontent_1` unit (in-article, self-sizing). #1 (result) and
// #3 (homepage) live on different routes so they never collide on one page;
// when we productionize we can split them into distinct units so Newor can
// price/measure each independently.

const HATCH =
  "repeating-linear-gradient(135deg,#eef1f6,#eef1f6 10px,#e6e9f0 10px,#e6e9f0 20px)";

export function InContentAd({
  maxW = 728,
  h = 90,
  label,
}: {
  // Cap width so the unit tracks the block it sits under, centered within its
  // container. Defaults to a wide, short leaderboard (728×90) rather than a big
  // rectangle — less vertical intrusion in the content flow.
  maxW?: number;
  // Fixed height of the slot. Keep it short (banner shapes: 90 / 100).
  h?: number;
  // Dev-preview annotation only (e.g. "classic result") — never renders in prod.
  label?: string;
}) {
  const isDev = process.env.NODE_ENV === "development";
  const [preview, setPreview] = useState(false);
  useEffect(() => {
    if (process.env.NODE_ENV !== "development") return;
    const q = new URLSearchParams(window.location.search).get("adpreview");
    try {
      if (q === "0") sessionStorage.removeItem("adpreview");
      else if (q !== null) sessionStorage.setItem("adpreview", "1");
      setPreview(sessionStorage.getItem("adpreview") === "1");
    } catch {
      setPreview(q !== null && q !== "0");
    }
  }, []);

  const unit = AD_UNITS.incontent_1;

  // Production: the real in-article unit, inert until approved + provisioned.
  if (!isDev) {
    if (!ADSENSE_ENABLED || !unit.slotId) return null;
    return (
      <div className="mx-auto w-full" style={{ maxWidth: maxW }}>
        <AdSlot fluid slotId={unit.slotId} />
      </div>
    );
  }

  // Dev, preview off: render nothing so ordinary dev browsing stays clean.
  if (!preview) return null;

  // Dev preview creative — a house/placeholder look, never mistaken for a real
  // served ad. Short banners lay the label out inline; anything taller stacks.
  const compact = h < 140;
  return (
    <div
      className="mx-auto flex w-full items-center justify-center"
      style={{
        maxWidth: maxW,
        height: h,
        gap: compact ? 10 : 4,
        flexDirection: compact ? "row" : "column",
        flexWrap: compact ? "wrap" : "nowrap",
        background: HATCH,
        border: "1px solid #c4cad6",
        borderRadius: "var(--radius-card)",
        color: "#5b6274",
        fontFamily: "monospace",
        textAlign: "center",
        position: "relative",
        overflow: "hidden",
      }}
    >
      <span
        style={{ position: "absolute", top: 6, right: 8, fontSize: 9, color: "#98a0b2" }}
      >
        ⓘ ✕
      </span>
      <span
        style={{ fontSize: 10, letterSpacing: "0.15em", textTransform: "uppercase" }}
      >
        Advertisement
      </span>
      <span style={{ fontSize: 12, fontWeight: 700 }}>
        {maxW}×{h}
        {label ? ` · ${label}` : ""}
      </span>
    </div>
  );
}
