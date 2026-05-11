import { HomeContent } from "@/components/HomeContent";
import { bannerVariants, STATIC_BANNERS } from "@/lib/banners";
import { MODES } from "@/lib/modes";
import {
  SITE_DEFAULT_DESCRIPTION,
  SITE_NAME,
  SITE_URL,
} from "@/lib/site";

// SSR's deterministic first frame is STATIC_BANNERS[0] (the highest-weighted
// key art entry). Preloading its mobile + desktop AVIFs lets the browser kick
// off the LCP image fetch from the very first chunk of HTML — before the
// <picture> tag is even parsed — which is the single biggest mobile-LCP win.
const FIRST_BANNER = STATIC_BANNERS[0];
const FIRST_BANNER_VARIANTS = FIRST_BANNER ? bannerVariants(FIRST_BANNER.file) : null;

const jsonLd = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "WebApplication",
      "@id": `${SITE_URL}/#webapp`,
      name: SITE_NAME,
      alternateName: [
        "OW dle",
        "Overwatch Wordle",
        "OW Wordle",
        "Daily Overwatch Quiz",
      ],
      url: SITE_URL,
      description: SITE_DEFAULT_DESCRIPTION,
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
      isPartOf: { "@id": `${SITE_URL}/#website` },
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
      "@type": "WebSite",
      "@id": `${SITE_URL}/#website`,
      name: SITE_NAME,
      alternateName: [
        "OW dle",
        "Overwatch Wordle",
        "OW Wordle",
        "Daily Overwatch Quiz",
      ],
      url: SITE_URL,
      description: SITE_DEFAULT_DESCRIPTION,
      inLanguage: "en",
      publisher: { "@id": `${SITE_URL}/#publisher` },
    },
    {
      "@type": "Organization",
      "@id": `${SITE_URL}/#publisher`,
      name: SITE_NAME,
      url: SITE_URL,
    },
    {
      "@type": "ItemList",
      "@id": `${SITE_URL}/#modes`,
      name: `${SITE_NAME} modes`,
      description:
        "Daily Overwatch quiz games offered by OWdle. Each mode is a different way to identify the daily hero.",
      numberOfItems: MODES.length,
      itemListOrder: "https://schema.org/ItemListOrderAscending",
      itemListElement: MODES.map((mode, i) => ({
        "@type": "ListItem",
        position: i + 1,
        name: mode.label,
        description: mode.blurb,
        ...(mode.built ? { url: `${SITE_URL}/${mode.slug}/` } : {}),
      })),
    },
  ],
};

export default function Home() {
  return (
    <>
      {FIRST_BANNER_VARIANTS && (
        <>
          <link
            rel="preload"
            as="image"
            href={FIRST_BANNER_VARIANTS.mobileAvif}
            type="image/avif"
            media="(max-width: 767px)"
            fetchPriority="high"
          />
          <link
            rel="preload"
            as="image"
            href={FIRST_BANNER_VARIANTS.desktopAvif}
            type="image/avif"
            media="(min-width: 768px)"
            fetchPriority="high"
          />
        </>
      )}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c"),
        }}
      />
      <HomeContent />
    </>
  );
}
