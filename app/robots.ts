import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site";

export const dynamic = "force-static";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      // Internal-only routes — keep them out of search results. Game
      // assets are NOT disallowed here because Google Images is a real
      // discovery channel; _headers blocks cross-origin embedding but
      // leaves indexing open.
      //
      // /melee is now a public BONUS mode (built:true) so it is indexable,
      // in the sitemap, and NOT disallowed. /map stays an unlisted featured
      // WIP mode (lib/modes.ts: built:false), shown only as a "Soon" teaser
      // and HARD-gated to 404 in prod (app/map/page.tsx `if (!IS_DEV)
      // notFound()`), as is /labeler/*. These disallows are belt-and-
      // suspenders so nothing crawls them even if a gate is relaxed.
      // The /archive/ HUB is crawlable and in the sitemap: it's a real
      // server-rendered landing page describing the replay feature, with no
      // puzzle content on it. Only the per-mode replay routes beneath it are
      // blocked — those are client-only game surfaces that would serve a
      // crawler an empty shell. Add each new /archive/<mode>/ route here as
      // it ships; the bare "/archive/" prefix must NOT come back or it
      // re-blocks the hub.
      disallow: ["/labeler/", "/map/", "/archive/classic/", "/archive/sound/"],
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
