import type { Metadata } from "next";
import { MeleeGame } from "@/components/MeleeGame";
import { modeMetadata } from "@/lib/site";

// Melee mode — WIP. Identify the hero from their melee sound in three
// guesses; the source MP4 reveals at the end. Registered as an unlisted
// mode (built: false in lib/modes.ts) so it stays out of the daily
// rotation and the home grid until launch. noindex keeps it out of search.

const META = {
  slug: "melee",
  title: "Melee",
  description:
    "Identify the Overwatch hero from their melee sound. Three guesses, then the source clip is revealed. A daily Overwatch melee quiz.",
};

export const metadata: Metadata = {
  ...modeMetadata(META),
  robots: { index: false, follow: false },
};

export default function MeleePage() {
  return <MeleeGame />;
}
