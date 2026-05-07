import { SplashGame } from "@/components/SplashGame";
import { modeJsonLd, modeMetadata } from "@/lib/site";

const META = {
  slug: "splash",
  title: "Spotlight",
  description:
    "Identify the Overwatch hero from a cropped sliver of splash art. The image zooms out with each guess. A daily Overwatch splash art and skin quiz.",
};

export const metadata = modeMetadata(META);

const jsonLd = modeJsonLd(META);

export default function SplashPage() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <SplashGame />
    </>
  );
}
