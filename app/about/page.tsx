import { ModeBreadcrumbs } from "@/components/ModeBreadcrumbs";
import { MakerNote } from "@/components/MakerNote";
import { SITE_NAME, SITE_URL, modeMetadata } from "@/lib/site";

// Intentionally bare. The only body content is the origin story
// (components/MakerNote.tsx), which is Yush's own words. Nothing else here
// is invented copy; anything with a voice is Yash's to write.
const PAGE_DESCRIPTION =
  "About OWdle, a daily Overwatch guessing game, and the person who makes it.";

export const metadata = modeMetadata({
  slug: "about",
  title: "About",
  seoTitle: "About OWdle",
  description: PAGE_DESCRIPTION,
});

const PAGE_URL = `${SITE_URL}/about/`;

const jsonLd = {
  "@context": "https://schema.org",
  "@type": "BreadcrumbList",
  "@id": `${PAGE_URL}#breadcrumbs`,
  itemListElement: [
    { "@type": "ListItem", position: 1, name: SITE_NAME, item: SITE_URL },
    { "@type": "ListItem", position: 2, name: "About", item: PAGE_URL },
  ],
};

export default function AboutPage() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c"),
        }}
      />
      <ModeBreadcrumbs label="About" />
      <main className="flex-1">
        <div className="mx-auto max-w-2xl px-6 py-14">
          <h1 className="text-2xl text-ink">About</h1>
          <div className="mt-6">
            <MakerNote />
          </div>
        </div>
      </main>
    </>
  );
}
