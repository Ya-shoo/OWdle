import { AbilityGame } from "@/components/AbilityGame";
import { modeJsonLd, modeMetadata } from "@/lib/site";

const META = {
  slug: "ability",
  title: "Ability",
  description:
    "Whose Overwatch ability is this? An ability icon is gradually revealed with each guess. Daily Overwatch ability quiz — name the hero from their kit.",
};

export const metadata = modeMetadata(META);

const jsonLd = modeJsonLd(META);

export default function AbilityPage() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <AbilityGame />
    </>
  );
}
