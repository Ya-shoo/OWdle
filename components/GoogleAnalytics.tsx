import Script from "next/script";
import { GA_MEASUREMENT_ID } from "@/lib/site";

// Google Analytics 4 (gtag.js), mounted from app/layout.tsx.
//
// Why this exists: Monumetric verifies a site's traffic by reading its GA4
// property during ad onboarding. The sites run on PostHog, not GA, so we add
// GA solely to give Monumetric a property to connect. PostHog is unaffected.
//
// Why hand-rolled instead of @next/third-parties: that package is the
// official wrapper but is flagged experimental and isn't a dependency here;
// it's a thin shell over next/script. Replicating its gtag snippet directly
// keeps the dependency surface flat (AGENTS.md: this is a modified Next —
// avoid assumptions/new deps) while producing identical output.
//
// Pageviews: we do NOT manually send page_view. GA4 Enhanced Measurement
// ("Page changes based on browser history events", on by default) captures
// App Router SPA navigations automatically — the same mechanism
// @next/third-parties relies on. Manual sends here would double-count.
//
// Production-only: gtag never loads under `next dev` (or a local prod run on
// localhost is the only leak — negligible). This keeps dev/localhost traffic
// out of the GA property that Monumetric is about to review.
export function GoogleAnalytics() {
  if (process.env.NODE_ENV !== "production" || !GA_MEASUREMENT_ID) return null;

  return (
    <>
      <Script
        src={`https://www.googletagmanager.com/gtag/js?id=${GA_MEASUREMENT_ID}`}
        strategy="afterInteractive"
      />
      <Script id="ga-gtag" strategy="afterInteractive">
        {`window.dataLayer = window.dataLayer || [];
function gtag(){dataLayer.push(arguments);}
gtag('js', new Date());
gtag('config', '${GA_MEASUREMENT_ID}');`}
      </Script>
    </>
  );
}
