import { MapGame } from "@/components/MapGame";
import { modeMetadata } from "@/lib/site";

// Unlisted while map mode is under construction. The route works
// (so Yash can hit it cross-device for internal testing) but is
// hidden from the home grid (lib/modes.ts: built: false), excluded
// from the sitemap, blocked in robots.txt (/map/), and noindexed
// here as belt-and-suspenders against any rogue crawler.
export const metadata = {
  ...modeMetadata({
    slug: "map",
    title: "Map",
    description:
      "Daily Overwatch GeoGuessr. Five POVs, five guesses — pick the map, drop a pin where the screenshot was taken.",
  }),
  robots: { index: false, follow: false },
};

export default function MapPage() {
  return <MapGame />;
}
