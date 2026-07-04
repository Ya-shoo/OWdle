import { OG_CONTENT_TYPE, OG_SIZE, renderModeOgImage } from "@/lib/og";
import { getMode } from "@/lib/modes";

const MODE = getMode("melee")!;

export const alt = `OWdle · ${MODE.label} mode`;
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;
export const dynamic = "force-static";

export default function Image() {
  return renderModeOgImage({
    // Reinhardt — the hammer hero reads instantly as "melee".
    heroSplash: "reinhardt.jpg",
    modeLabel: MODE.label,
    modeBlurb: MODE.blurb,
    slug: MODE.slug,
  });
}
