import type { MetadataRoute } from "next";
import { PLAYABLE_MODE_SLUGS } from "@/lib/modes";
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
    // Canonical daily modes + bonus Melee (PLAYABLE_MODE_SLUGS). Featured
    // Map stays out while built:false. Melee joins here so search engines
    // discover the new bonus page.
    ...PLAYABLE_MODE_SLUGS.map((slug) => ({
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
