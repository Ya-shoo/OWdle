import { QuoteGame } from "@/components/QuoteGame";
import { ModeBreadcrumbs } from "@/components/ModeBreadcrumbs";
import { ModeFooterNav } from "@/components/ModeFooterNav";
import { modeJsonLd, modeMetadata } from "@/lib/site";

const META = {
  slug: "quote",
  title: "Quote",
  description:
    "A pre-match exchange between two Overwatch heroes. Identify both speakers from a single line of voice dialogue. New daily Overwatch quote quiz every day.",
};

export const metadata = modeMetadata(META);

const jsonLd = modeJsonLd(META);

export default function QuotePage() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c"),
        }}
      />
      <ModeBreadcrumbs label={META.title} />
      <QuoteGame />
      <ModeFooterNav current="quote" />
    </>
  );
}
