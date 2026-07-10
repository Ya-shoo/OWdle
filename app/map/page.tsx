import { notFound } from "next/navigation";
import { MapGame } from "@/components/MapGame";
import { modeMetadata } from "@/lib/site";

// Unlisted while map mode is under construction, and HARD-gated like
// /labeler/* and /melee: `if (!IS_DEV) notFound()` makes the route 404
// in the production static export, so there's no public access while
// it's WIP — reachable only via `npm run dev`. Also hidden from the home
// grid (lib/modes.ts: built: false), excluded from the sitemap, blocked
// in robots.txt (/map/), and noindexed here as belt-and-suspenders.
const IS_DEV = process.env.NODE_ENV !== "production";

export const metadata = {
  ...modeMetadata({
    slug: "map",
    title: "Map",
    description:
      "Daily Overwatch GeoGuessr. Five POVs, five guesses. Pick the map, drop a pin where the screenshot was taken.",
  }),
  robots: { index: false, follow: false },
};

export default function MapPage() {
  if (!IS_DEV) notFound();
  return <MapGame />;
}
