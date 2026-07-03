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
      // /map and /melee are unlisted WIP modes (lib/modes.ts: built:
      // false), shown only as "Soon" teaser cards. Both routes are
      // HARD-gated to 404 in prod (see each page.tsx `if (!IS_DEV)
      // notFound()`), as is /labeler/*. These disallows are belt-and-
      // suspenders so nothing crawls them even if a gate is relaxed.
      disallow: ["/labeler/", "/map/", "/melee/"],
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
