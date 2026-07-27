import Link from "next/link";
import { ModeBreadcrumbs } from "@/components/ModeBreadcrumbs";
import { GUIDES } from "@/lib/guides";
import { SITE_NAME, SITE_URL, modeMetadata } from "@/lib/site";

// One plain page, styled like /privacy: a heading and a short factual
// block per mode. No cards, no hero, no per-mode sub-pages. If real
// strategy tips get added later, they are Yash's words to write.
const PAGE_DESCRIPTION =
  "How each OWdle mode works: Classic, Quote, Ability, Spotlight, and Sound.";

export const metadata = modeMetadata({
  slug: "guides",
  title: "Guides",
  seoTitle: "OWdle Guides",
  description: PAGE_DESCRIPTION,
});

const PAGE_URL = `${SITE_URL}/guides/`;

const jsonLd = {
  "@context": "https://schema.org",
  "@type": "BreadcrumbList",
  "@id": `${PAGE_URL}#breadcrumbs`,
  itemListElement: [
    { "@type": "ListItem", position: 1, name: SITE_NAME, item: SITE_URL },
    { "@type": "ListItem", position: 2, name: "Guides", item: PAGE_URL },
  ],
};

export default function GuidesPage() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c"),
        }}
      />
      <ModeBreadcrumbs label="Guides" />
      <main className="flex-1">
        <div className="mx-auto max-w-2xl px-6 py-14 text-[15px] leading-relaxed text-ink-soft">
          <h1 className="text-2xl text-ink">Guides</h1>
          <p className="mt-4">
            How each mode works. For the basics, see{" "}
            <Link
              href="/how-to-play/"
              className="underline underline-offset-2 hover:text-accent"
            >
              how to play
            </Link>
            .
          </p>
          {GUIDES.map((g) => (
            <section key={g.slug} className="mt-8">
              <h2 className="text-lg text-ink">
                <Link href={`/${g.slug}/`} className="hover:text-accent">
                  {g.label}
                </Link>
              </h2>
              <p className="mt-2">{g.intro}</p>
            </section>
          ))}
        </div>
      </main>
    </>
  );
}
