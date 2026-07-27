import Link from "next/link";
import { ModeBreadcrumbs } from "@/components/ModeBreadcrumbs";
import { HeroReference } from "@/components/HeroReference";
import { HEROES, type Hero } from "@/lib/heroes";
import { SITE_NAME, SITE_URL, modeMetadata } from "@/lib/site";

// Hero reference. The page shell (metadata, JSON-LD, breadcrumbs, prose) is a
// SERVER component; the roster itself renders inside <HeroReference>, a client
// island that adds a lookup box. That island is crawl-safe by construction:
// its empty-query first render lists every hero, and under `output: "export"`
// the first render is what ships, so every attribute row is still in the built
// HTML (the whole point of the page). See components/HeroReference.tsx.
//
// COPY: the only prose here is one factual framing sentence. The hero rows
// and the affiliation notes are existing curated data from data/heroes.json,
// not written for this page. Nothing here invents a voice.

const PAGE_DESCRIPTION =
  "Every Overwatch hero with the attributes OWdle Classic compares against: role, origin, affiliation, species, gender, age, release year, and HP. Search the roster by name, origin, or affiliation.";

export const metadata = modeMetadata({
  slug: "heroes",
  title: "Hero reference",
  seoTitle: "Overwatch Hero Attribute Reference",
  description: PAGE_DESCRIPTION,
});

const PAGE_URL = `${SITE_URL}/heroes/`;

const byName = (a: Hero, b: Hero) => a.name.localeCompare(b.name);

const jsonLd = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "BreadcrumbList",
      "@id": `${PAGE_URL}#breadcrumbs`,
      itemListElement: [
        { "@type": "ListItem", position: 1, name: SITE_NAME, item: SITE_URL },
        { "@type": "ListItem", position: 2, name: "Hero reference", item: PAGE_URL },
      ],
    },
    {
      "@type": "ItemList",
      "@id": `${PAGE_URL}#heroes`,
      name: "Overwatch hero attribute reference",
      description: PAGE_DESCRIPTION,
      numberOfItems: HEROES.length,
      itemListElement: [...HEROES].sort(byName).map((h, i) => ({
        "@type": "ListItem",
        position: i + 1,
        name: h.name,
      })),
    },
  ],
};

export default function HeroesPage() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c"),
        }}
      />
      <ModeBreadcrumbs label="Hero reference" />
      <main className="flex-1">
        <div className="mx-auto max-w-5xl px-6 py-14">
          <h1 className="font-display display-headline text-4xl uppercase text-ink sm:text-5xl">
            Hero reference
          </h1>
          <p className="mt-4 max-w-2xl text-[15px] leading-relaxed text-ink-soft">
            All {HEROES.length} Overwatch heroes and the eight attributes{" "}
            <Link
              href="/classic/"
              className="underline underline-offset-2 hover:text-accent"
            >
              Classic
            </Link>{" "}
            compares your guess against. Search the roster to look up any hero.
          </p>

          <HeroReference heroes={HEROES} />
        </div>
      </main>
    </>
  );
}
