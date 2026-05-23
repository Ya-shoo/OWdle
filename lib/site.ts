import type { Metadata } from "next";

export const SITE_URL = "https://playowdle.com";
export const SITE_NAME = "OWdle";
export const SITE_TAGLINE = "the daily Overwatch quiz";

export const SITE_DEFAULT_DESCRIPTION =
  "OWdle is the daily Overwatch hero quiz. Wordle-inspired modes: guess the hero by attributes, ability icons, splash art, and voice lines. New puzzles every day at 2:15am Pacific Time.";

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
  "Overwatch quiz",
  "Overwatch wordle",
  "OWdle",
  "Overwatch 2 quiz",
  "guess the Overwatch hero",
  "daily Overwatch hero quiz",
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
}: ModeMetaInput): Metadata {
  const canonical = `/${slug}/`;
  const fullUrl = `${SITE_URL}${canonical}`;
  const ogTitle = `${title} · ${SITE_NAME}`;
  return {
    title,
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
