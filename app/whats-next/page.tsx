import Link from "next/link";
import { ModeBreadcrumbs } from "@/components/ModeBreadcrumbs";
import { RequestNextGame } from "@/components/RequestNextGame";
import { HomeFaq } from "@/components/HomeFaq";
import { HOME_FAQ } from "@/lib/faq";
import { SITE_NAME, SITE_URL, modeMetadata } from "@/lib/site";

// The roadmap vote used to sit on the homepage next to the tip jar, where
// "Which game should I work on next?" (with covers of unrelated games) read
// as the loudest "portfolio operator / content farm" signal. It now lives
// here on its own opt-in page, reachable only from a quiet "What's next?"
// link under the homepage's sister-site cards. Being openly "one of a few
// games I build" is fine here: it's off the main path and framed as a
// hobbyist roadmap, not the homepage's headline.
//
// The homepage FAQ also moved here (rendered below the vote). Its FAQPage
// JSON-LD travels with the visible copy so structured data and on-page text
// stay together per Google's guidelines. Both still read lib/faq HOME_FAQ,
// so the visible questions and the schema never drift.
const PAGE_DESCRIPTION =
  "Vote on which game gets the daily guessing-game treatment next. The top picks are what the maker looks at when deciding what to build after OWdle.";

export const metadata = modeMetadata({
  slug: "whats-next",
  title: "What's next?",
  description: PAGE_DESCRIPTION,
});

const PAGE_URL = `${SITE_URL}/whats-next/`;

const jsonLd = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "BreadcrumbList",
      "@id": `${PAGE_URL}#breadcrumbs`,
      itemListElement: [
        { "@type": "ListItem", position: 1, name: SITE_NAME, item: SITE_URL },
        {
          "@type": "ListItem",
          position: 2,
          name: "What's next?",
          item: PAGE_URL,
        },
      ],
    },
    {
      // Relocated from the homepage. Schema lives here because the matching
      // visible FAQ (components/HomeFaq) renders on this page; both read
      // lib/faq HOME_FAQ so they stay identical.
      "@type": "FAQPage",
      "@id": `${PAGE_URL}#faq`,
      mainEntity: HOME_FAQ.map(({ q, a }) => ({
        "@type": "Question",
        name: q,
        acceptedAnswer: { "@type": "Answer", text: a },
      })),
    },
  ],
};

export default function WhatsNextPage() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c"),
        }}
      />
      <ModeBreadcrumbs label="What's next?" />
      <main className="flex-1">
        <section className="mx-auto max-w-2xl px-6 pb-12 pt-10 sm:pt-14">
          <p className="font-mono text-xs uppercase tracking-[0.22em] text-info">
            Roadmap · Community vote
          </p>
          <h1 className="mt-4 font-display display-headline text-4xl leading-[0.95] text-ink sm:text-5xl">
            What&rsquo;s next?
          </h1>
          <p className="mt-5 text-base leading-relaxed text-ink-soft [text-wrap:pretty]">
            OWdle is one of a handful of daily guessing games I build in my
            spare time. If there&rsquo;s a game you want to see get the same
            treatment, put it forward below. The top picks are what I actually
            look at when I decide what to make next.
          </p>

          <div className="mt-8 rounded-(--radius-card) border border-line bg-muted p-6 shadow-card sm:p-8">
            <RequestNextGame />
          </div>
        </section>

        {/* FAQ relocated from the homepage. Rendered below the vote so the
            page's primary purpose (the roadmap vote) still leads. */}
        <HomeFaq />

        <section className="mx-auto max-w-2xl px-6 pb-20">
          <Link
            href="/"
            className="inline-flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.22em] text-ink-faint transition-colors hover:text-info"
          >
            <svg
              aria-hidden
              width="14"
              height="10"
              viewBox="0 0 14 10"
              className="rotate-180"
            >
              <path
                d="M0 5 L12 5 M8 1 L13 5 L8 9"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="square"
              />
            </svg>
            Back to today&rsquo;s puzzles
          </Link>
        </section>
      </main>
    </>
  );
}
