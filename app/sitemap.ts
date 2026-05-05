import type { MetadataRoute } from "next";
import { BUILT_MODE_SLUGS } from "@/lib/modes";
import { SITE_URL } from "@/lib/site";

export const dynamic = "force-static";

export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date();
  return [
    {
      url: `${SITE_URL}/`,
      lastModified,
      changeFrequency: "daily",
      priority: 1,
    },
    ...BUILT_MODE_SLUGS.map((slug) => ({
      url: `${SITE_URL}/${slug}/`,
      lastModified,
      changeFrequency: "daily" as const,
      priority: 0.9,
    })),
    {
      url: `${SITE_URL}/how-to-play/`,
      lastModified,
      changeFrequency: "monthly",
      priority: 0.7,
    },
  ];
}
