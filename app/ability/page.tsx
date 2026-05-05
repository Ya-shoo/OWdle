import { AbilityGame } from "@/components/AbilityGame";
import { modeMetadata } from "@/lib/site";

export const metadata = modeMetadata({
  slug: "ability",
  title: "Ability",
  description:
    "Whose Overwatch ability is this? An ability icon is gradually revealed with each guess. Daily Overwatch ability quiz — name the hero from their kit.",
});

export default function AbilityPage() {
  return <AbilityGame />;
}
