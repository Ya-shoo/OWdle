"use client";

import { useEffect, useRef, useState } from "react";
import { ADSENSE_CLIENT } from "@/lib/site";

// One AdSense display unit — the <ins> that adsbygoogle.js fills. Guarded on
// ADSENSE_CLIENT and a real slotId, so an un-provisioned unit (slotId still
// "") or any non-production build renders nothing.
//
// Collapse-on-unfilled: after the ad request, AdSense stamps the <ins> with
// data-ad-status="filled" | "unfilled". If it comes back unfilled (no demand,
// or the site/account isn't approved for serving yet) we drop the <ins> so
// there's never a blank reserved box — and report the status up via onStatus
// so a caller can hide its own chrome too (e.g. the mobile anchor's close
// button). Net effect: pre-approval the whole ad layer is invisible, and it
// lights up on its own once real ads start filling — no redeploy needed.
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
  onStatus?: (status: "filled" | "unfilled") => void;
};

export function AdSlot({ slotId, w, h, fluid, onStatus }: AdSlotProps) {
  const insRef = useRef<HTMLModElement>(null);
  const requested = useRef(false);
  // Held in a ref so a caller passing an inline arrow doesn't retrigger the
  // observer effect (which would re-observe on every render). Updated in an
  // effect rather than during render, per the refs lint rule.
  const onStatusRef = useRef(onStatus);
  useEffect(() => {
    onStatusRef.current = onStatus;
  }, [onStatus]);
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    if (!ADSENSE_CLIENT || !slotId) return;
    if (!requested.current) {
      requested.current = true;
      try {
        (window.adsbygoogle = window.adsbygoogle || []).push({});
      } catch {
        // adsbygoogle.js absent or blocked — nothing to request.
      }
    }
    const el = insRef.current;
    if (!el) return;
    const observer = new MutationObserver(() => {
      const status = el.getAttribute("data-ad-status");
      if (status === "filled") {
        onStatusRef.current?.("filled");
      } else if (status === "unfilled") {
        onStatusRef.current?.("unfilled");
        setCollapsed(true);
      }
    });
    observer.observe(el, {
      attributes: true,
      attributeFilter: ["data-ad-status"],
    });
    return () => observer.disconnect();
  }, [slotId]);

  if (!ADSENSE_CLIENT || !slotId || collapsed) return null;

  return (
    <ins
      ref={insRef}
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
