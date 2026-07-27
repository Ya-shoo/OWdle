import { QuoteGame } from "@/components/QuoteGame";
import { ModeBreadcrumbs } from "@/components/ModeBreadcrumbs";
import { ModeFooterNav } from "@/components/ModeFooterNav";
import { HomeFaq } from "@/components/HomeFaq";
import { ModeStatsPanel } from "@/components/ModeStatsPanel";
import { QUOTE_FAQ } from "@/lib/faq";
import { faqJsonLd, modeJsonLd, modeMetadata } from "@/lib/site";

const META = {
  slug: "quote",
  title: "Quote",
  description:
    "A pre-match exchange between two Overwatch heroes. Identify both speakers from a single line of voice dialogue. New daily Overwatch quote quiz every day.",
};

export const metadata = modeMetadata(META);

const jsonLd = modeJsonLd(META);
const faqLd = faqJsonLd(META.slug, QUOTE_FAQ);

export default function QuotePage() {
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
          __html: JSON.stringify(faqLd).replace(/</g, "\\u003c"),
        }}
      />
      <ModeBreadcrumbs label={META.title} />
      <QuoteGame />
      <ModeStatsPanel mode="quote" />
      <HomeFaq items={QUOTE_FAQ} heading="Quote mode: frequently asked questions" />
      <ModeFooterNav current="quote" />
    </>
  );
}
