import { OG_CONTENT_TYPE, OG_SIZE, renderModeOgImage } from "@/lib/og";

export const alt = "OWdle · How to play";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;
export const dynamic = "force-static";

export default function Image() {
  return renderModeOgImage({
    heroSplash: "zenyatta.jpg",
    modeLabel: "How to play",
    modeBlurb: "5 modes · different hero per mode · resets 2:15am pacific",
    slug: "how-to-play",
  });
}
