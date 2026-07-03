import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { MeleeGame } from "@/components/MeleeGame";
import { modeMetadata } from "@/lib/site";

// Melee mode — WIP. Identify the hero from their melee sound in three
// guesses; the source MP4 reveals at the end. Registered as an unlisted
// mode (built: false in lib/modes.ts) so it surfaces ONLY as a "Soon"
// teaser card on the home grid and stays out of the daily rotation.
//
// The route itself is HARD-gated like /labeler/*: `if (!IS_DEV) notFound()`
// makes it 404 in the production static export, so there is no public
// access to the playable page by any means yet — it's reachable only via
// `npm run dev`. noindex + robots.txt (/melee/) + sitemap exclusion
// (built:false) are belt-and-suspenders on top of the hard gate.

const IS_DEV = process.env.NODE_ENV !== "production";

const META = {
  slug: "melee",
  title: "Melee",
  // Keyword-rich <title>/OG override (breadcrumb + JSON-LD name stay "Melee").
  seoTitle: "Overwatch Melee Sound Quiz",
  description:
    "Can you name the Overwatch hero by their melee sound? Three guesses before the clip gives it away. A new melee puzzle every day.",
};

export const metadata: Metadata = {
  ...modeMetadata(META),
  robots: { index: false, follow: false },
};

export default function MeleePage() {
  if (!IS_DEV) notFound();
  return <MeleeGame />;
}
