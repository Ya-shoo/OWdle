import { HomeContent } from "@/components/HomeContent";
import { MODES } from "@/lib/modes";
import {
  SITE_DEFAULT_DESCRIPTION,
  SITE_NAME,
  SITE_URL,
} from "@/lib/site";

const jsonLd = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "WebApplication",
      "@id": `${SITE_URL}/#webapp`,
      name: SITE_NAME,
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
      about: {
        "@type": "VideoGame",
        name: "Overwatch 2",
        publisher: {
          "@type": "Organization",
          name: "Blizzard Entertainment",
        },
        gamePlatform: ["PC", "PlayStation", "Xbox", "Nintendo Switch"],
      },
    },
    {
      "@type": "WebSite",
      "@id": `${SITE_URL}/#website`,
      name: SITE_NAME,
      url: SITE_URL,
      description: SITE_DEFAULT_DESCRIPTION,
      inLanguage: "en",
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
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <HomeContent />
    </>
  );
}
