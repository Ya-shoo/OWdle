import { AbilityGame } from "@/components/AbilityGame";
import { ModeBreadcrumbs } from "@/components/ModeBreadcrumbs";
import { ModeFooterNav } from "@/components/ModeFooterNav";
import { modeJsonLd, modeMetadata } from "@/lib/site";

const META = {
  slug: "ability",
  title: "Ability",
  description:
    "An Overwatch ability icon, revealed a little more with every miss. Guess the hero from their kit. A daily Overwatch ability quiz.",
};

export const metadata = modeMetadata(META);

const jsonLd = modeJsonLd(META);

export default function AbilityPage() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c"),
        }}
      />
      <ModeBreadcrumbs label={META.title} />
      <AbilityGame />
      <ModeFooterNav current="ability" />
    </>
  );
}
