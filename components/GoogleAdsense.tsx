import Script from "next/script";
import { ADSENSE_CLIENT } from "@/lib/site";

// Loads the AdSense library once for the whole app, mounted from
// app/layout.tsx — mirrors components/GoogleAnalytics.tsx (hand-rolled
// next/script, no @next/third-parties, per AGENTS.md).
//
// Production-only AND client-gated: under `next dev`, or before the AdSense
// review is approved (ADSENSE_CLIENT still ""), no script loads, so the ghost
// AdRails measurement runs exactly as today and no ad code ships.
//
// Auto ads stay OFF in the AdSense dashboard: loading this library does NOT by
// itself inject ads — every placement is a manual <ins> from AdSlot. Keep Auto
// ads disabled so the clean UI stays ours.
export function GoogleAdsense() {
  if (process.env.NODE_ENV !== "production" || !ADSENSE_CLIENT) return null;

  return (
    <Script
      id="adsbygoogle-init"
      src={`https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${ADSENSE_CLIENT}`}
      strategy="afterInteractive"
      crossOrigin="anonymous"
    />
  );
}
