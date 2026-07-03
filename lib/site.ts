import type { Metadata } from "next";

export const SITE_URL = "https://playowdle.com";
export const SITE_NAME = "OWdle";
export const SITE_TAGLINE = "the daily Overwatch quiz";

// Google Analytics 4 measurement ID for playowdle.com. Non-secret — it ships
// in the page source on the live site — so it lives here as a constant rather
// than an env var, which avoids GA silently failing to load if a deploy
// machine's .env drifts (Yash deploys from both Mac and Windows). Consumed by
// components/GoogleAnalytics.tsx, which only loads gtag in production builds.
// GA exists purely to satisfy Monumetric's traffic verification for ad
// onboarding; PostHog (instrumentation-client.ts) remains primary analytics.
export const GA_MEASUREMENT_ID = "G-98FN2ZJ7MV";

// Google AdSense publisher id. Non-secret — it ships in the page source and in
// public/ads.txt — so, like GA_MEASUREMENT_ID above, it's a constant here rather
// than an env var (a drifted .env on the Mac or Windows deploy box would
// otherwise silently disable ads). Setting it makes components/GoogleAdsense.tsx
// load the AdSense library in production — this IS the verification <script>
// AdSense asks you to add to <head>. Individual ad units still stay dark until
// each gets a real slotId in lib/adUnits.ts (provisioned after the site is
// approved), so arming the client is safe during review: the loader ships and
// zero ads render. Matching ads.txt line lives in public/ads.txt:
//   google.com, pub-2123726970271006, DIRECT, f08c47fec0942fa0
// Typed `string` (not the string literal) so `ADSENSE_CLIENT !== ""` gating in
// lib/adUnits.ts stays a real runtime check rather than a no-overlap TS error.
export const ADSENSE_CLIENT: string = "ca-pub-2123726970271006";

export const SITE_DEFAULT_DESCRIPTION =
  "OWdle is the daily Overwatch guessing game. Guess heroes by their attributes, ability sounds, splash art, and more. New puzzle every day at 2:15am Pacific Time.";

// Support/tip links for the home-page engagement section. Yash to update
// the Ko-fi handle once an account exists. SHARE_TEXT is consumed by the
// Twitter/X intent on the same panel.
export const SUPPORT_LINKS = {
  kofiUsername: "yushoo",
  kofi: "https://ko-fi.com/yushoo",
} as const;

export const SHARE_TEXT =
  "Playing OWdle, the daily Overwatch hero quiz.";

export const SITE_KEYWORDS = [
  "OWdle",
  "Overwatch wordle",
  "Overwatch dle",
  "Overwatch quiz",
  "Overwatch quiz game",
  "Overwatch daily quiz",
  "daily Overwatch hero quiz",
  "guess the Overwatch hero",
  "Overwatch 2 quiz",
  "Overwatch hero guesser",
  "Overwatch trivia",
  "Overwatch ability quiz",
  "Overwatch splash art quiz",
  "Overwatch voice line quiz",
];

type ModeMetaInput = {
  slug: string;
  title: string;
  description: string;
  // Optional keyword-rich override for the <title> tag + OG/Twitter title —
  // what shows as the blue link in search results and on social cards.
  // Falls back to `title`. Kept separate so the in-app breadcrumb and the
  // JSON-LD `name` stay short ("Sound") while search sees the full phrase
  // ("Overwatch Ability Sound Quiz").
  seoTitle?: string;
};

// Per-mode OG images come from each route's own opengraph-image.tsx via
// Next 16's file convention. We deliberately don't set openGraph.images
// here — that would shadow the file-based image with this single shared
// fallback. The root /opengraph-image.tsx still covers any segment that
// doesn't define its own.
export function modeMetadata({
  slug,
  title,
  description,
  seoTitle,
}: ModeMetaInput): Metadata {
  const canonical = `/${slug}/`;
  const fullUrl = `${SITE_URL}${canonical}`;
  // Root layout applies the `%s · OWdle` title template, so this becomes
  // e.g. "Overwatch Ability Sound Quiz · OWdle" in the <title> and SERP.
  const headTitle = seoTitle ?? title;
  const ogTitle = `${headTitle} · ${SITE_NAME}`;
  return {
    title: headTitle,
    description,
    alternates: { canonical },
    openGraph: {
      type: "website",
      siteName: SITE_NAME,
      url: fullUrl,
      title: ogTitle,
      description,
      locale: "en_US",
    },
    twitter: {
      card: "summary_large_image",
      title: ogTitle,
      description,
    },
  };
}

// JSON-LD for individual mode pages. Each mode is presented as its own
// WebApplication (GameApplication subcategory) so Google can index it as a
// distinct game in addition to OWdle as a whole. `isPartOf` references the
// home-page #webapp node defined in app/page.tsx, tying the graph together.
// Always paired with modeMetadata on the same page.
export function modeJsonLd({ slug, title, description }: ModeMetaInput) {
  const fullUrl = `${SITE_URL}/${slug}/`;
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "WebApplication",
        "@id": `${fullUrl}#mode`,
        name: `${SITE_NAME} ${title}`,
        url: fullUrl,
        description,
        applicationCategory: "GameApplication",
        genre: ["Puzzle", "Trivia", "Word Game"],
        operatingSystem: "Web",
        browserRequirements: "Requires JavaScript and HTML5.",
        inLanguage: "en",
        isAccessibleForFree: true,
        offers: {
          "@type": "Offer",
          price: "0",
          priceCurrency: "USD",
        },
        isPartOf: { "@id": `${SITE_URL}/#webapp` },
        // OWdle's hero pool spans the entire Overwatch franchise — original
        // Overwatch (2016–2022) and Overwatch 2 (2022–present) — so we
        // reference both as subjects rather than implying we cover only
        // one. Both share Blizzard as publisher.
        about: [
          {
            "@type": "VideoGame",
            name: "Overwatch",
            publisher: {
              "@type": "Organization",
              name: "Blizzard Entertainment",
            },
            gamePlatform: ["PC", "PlayStation", "Xbox", "Nintendo Switch"],
          },
          {
            "@type": "VideoGame",
            name: "Overwatch 2",
            publisher: {
              "@type": "Organization",
              name: "Blizzard Entertainment",
            },
            gamePlatform: ["PC", "PlayStation", "Xbox", "Nintendo Switch"],
          },
        ],
      },
      {
        "@type": "BreadcrumbList",
        "@id": `${fullUrl}#breadcrumbs`,
        itemListElement: [
          {
            "@type": "ListItem",
            position: 1,
            name: SITE_NAME,
            item: SITE_URL,
          },
          {
            "@type": "ListItem",
            position: 2,
            name: title,
            item: fullUrl,
          },
        ],
      },
    ],
  };
}
