import { MeleeGame } from "@/components/MeleeGame";
import { ModeBreadcrumbs } from "@/components/ModeBreadcrumbs";
import { ModeFooterNav } from "@/components/ModeFooterNav";
import { HomeFaq } from "@/components/HomeFaq";
import { MELEE_FAQ } from "@/lib/faq";
import { modeJsonLd, modeMetadata, SITE_URL } from "@/lib/site";

// Melee — a BONUS mode: a real, indexable, individually shareable page
// that lives OUTSIDE the canonical five-mode daily (tier:"bonus" in
// lib/modes.ts keeps it out of streak/rank/day-complete). Identify the
// hero from their melee sound in three guesses; the source MP4 reveals at
// the end. No dev gate — this ships publicly, so it's a normal mode route
// with breadcrumbs, footer nav, and structured data like the daily modes.

const META = {
  slug: "melee",
  title: "Melee",
  // Keyword-rich <title>/OG override targeting "guess that overwatch hero's
  // melee sound" (breadcrumb + JSON-LD name stay the short "Melee").
  seoTitle: "Overwatch Melee Sound Quiz | Guess the Hero",
  description:
    "Can you name that Overwatch hero from just their melee sound? Play the daily melee sound quiz: three guesses, a new hero every day.",
};

export const metadata = modeMetadata(META);

// WebApplication + BreadcrumbList (shared mode graph) plus a Melee-specific
// FAQPage. The FAQ copy is ALSO rendered visibly below (HomeFaq + MELEE_FAQ),
// so the structured data matches on-page content per Google's guidelines.
const jsonLd = modeJsonLd(META);
const faqJsonLd = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  "@id": `${SITE_URL}/melee/#faq`,
  isPartOf: { "@id": `${SITE_URL}/#website` },
  mainEntity: MELEE_FAQ.map(({ q, a }) => ({
    "@type": "Question",
    name: q,
    acceptedAnswer: { "@type": "Answer", text: a },
  })),
};

export default function MeleePage() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c"),
        }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(faqJsonLd).replace(/</g, "\\u003c"),
        }}
      />
      <ModeBreadcrumbs label={META.title} />
      <MeleeGame />
      <HomeFaq items={MELEE_FAQ} heading="Melee mode: frequently asked questions" />
      <ModeFooterNav current="melee" />
    </>
  );
}
