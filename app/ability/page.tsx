import { AbilityGame } from "@/components/AbilityGame";
import { ModeBreadcrumbs } from "@/components/ModeBreadcrumbs";
import { ModeFooterNav } from "@/components/ModeFooterNav";
import { HomeFaq } from "@/components/HomeFaq";
import { ModeStatsPanel } from "@/components/ModeStatsPanel";
import { ABILITY_FAQ } from "@/lib/faq";
import { faqJsonLd, modeJsonLd, modeMetadata } from "@/lib/site";

const META = {
  slug: "ability",
  title: "Ability",
  description:
    "An Overwatch ability icon, revealed a little more with every miss. Guess the hero from their kit. A daily Overwatch ability quiz.",
};

export const metadata = modeMetadata(META);

const jsonLd = modeJsonLd(META);
const faqLd = faqJsonLd(META.slug, ABILITY_FAQ);

export default function AbilityPage() {
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
      <AbilityGame />
      <ModeStatsPanel mode="ability" />
      <HomeFaq items={ABILITY_FAQ} heading="Ability mode: frequently asked questions" />
      <ModeFooterNav current="ability" />
    </>
  );
}
