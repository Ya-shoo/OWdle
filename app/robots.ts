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
      disallow: ["/labeler/", "/dev/"],
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
