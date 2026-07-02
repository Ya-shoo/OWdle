"use client";

import { useEffect, useRef } from "react";
import { ADSENSE_CLIENT } from "@/lib/site";

// One AdSense display unit — the <ins> that adsbygoogle.js fills. Guarded on
// ADSENSE_CLIENT and a real slotId, so an un-provisioned unit (slotId still
// "") or any non-production build renders nothing. Callers (AdRails) can drop
// these in freely; they stay dormant until armed.
//
// Sizing: w/h come from the caller — AdRails passes the tier's slot size
// (300×600 on wide desktops, 160×600 on narrow) so the fixed unit matches its
// reserved container exactly and never shifts layout. `fluid` units size
// themselves (in-content) and ignore w/h.

declare global {
  interface Window {
    adsbygoogle?: unknown[];
  }
}

type AdSlotProps = {
  slotId: string;
  w?: number;
  h?: number;
  fluid?: boolean;
};

export function AdSlot({ slotId, w, h, fluid }: AdSlotProps) {
  // Each unit requests one fill on mount. A ref guard keeps React StrictMode's
  // dev double-invoke from pushing twice (moot in practice — ads never render
  // in dev — but correct if that ever changes).
  const requested = useRef(false);

  useEffect(() => {
    if (!ADSENSE_CLIENT || !slotId || requested.current) return;
    requested.current = true;
    try {
      (window.adsbygoogle = window.adsbygoogle || []).push({});
    } catch {
      // adsbygoogle.js absent or blocked — nothing to request.
    }
  }, [slotId]);

  if (!ADSENSE_CLIENT || !slotId) return null;

  return (
    <ins
      className="adsbygoogle"
      style={{
        display: fluid ? "block" : "inline-block",
        width: fluid ? undefined : w,
        height: fluid ? undefined : h,
      }}
      data-ad-client={ADSENSE_CLIENT}
      data-ad-slot={slotId}
      {...(fluid
        ? { "data-ad-format": "fluid", "data-ad-layout": "in-article" }
        : {})}
    />
  );
}
