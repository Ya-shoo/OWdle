import { ClassicGame } from "@/components/ClassicGame";
import { ModeBreadcrumbs } from "@/components/ModeBreadcrumbs";
import { ModeFooterNav } from "@/components/ModeFooterNav";
import { SiteGreeter } from "@/components/SiteGreeter";
import { HomeFaq } from "@/components/HomeFaq";
import { ModeStatsPanel } from "@/components/ModeStatsPanel";
import { CLASSIC_FAQ } from "@/lib/faq";
import { faqJsonLd, modeJsonLd, modeMetadata } from "@/lib/site";

const META = {
  slug: "classic",
  title: "Classic",
  description:
    "Daily Overwatch hero quiz. Guess by role, age, country, species, and HP. Each guess returns Wordle-style match tiles. Free, new puzzle daily.",
};

export const metadata = modeMetadata(META);

const jsonLd = modeJsonLd(META);
const faqLd = faqJsonLd(META.slug, CLASSIC_FAQ);

export default function ClassicPage() {
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
      <SiteGreeter />
      <ClassicGame />
      <ModeStatsPanel mode="classic" />
      <HomeFaq items={CLASSIC_FAQ} heading="Classic mode: frequently asked questions" />
      <ModeFooterNav current="classic" />
    </>
  );
}
