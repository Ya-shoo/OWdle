import { SplashGame } from "@/components/SplashGame";
import { ModeBreadcrumbs } from "@/components/ModeBreadcrumbs";
import { ModeFooterNav } from "@/components/ModeFooterNav";
import { HomeFaq } from "@/components/HomeFaq";
import { ModeStatsPanel } from "@/components/ModeStatsPanel";
import { SPLASH_FAQ } from "@/lib/faq";
import { faqJsonLd, modeJsonLd, modeMetadata } from "@/lib/site";

const META = {
  slug: "splash",
  title: "Spotlight",
  description:
    "Guess the Overwatch hero from a cropped sliver of splash art. The image zooms out with each guess. A daily Overwatch splash art and skin quiz.",
};

export const metadata = modeMetadata(META);

const jsonLd = modeJsonLd(META);
const faqLd = faqJsonLd(META.slug, SPLASH_FAQ);

export default function SplashPage() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c"),
        }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(faqLd).replace(/</g, "\\u003c"),
        }}
      />
      <ModeBreadcrumbs label={META.title} />
      <SplashGame />
      <ModeStatsPanel mode="splash" />
      <HomeFaq items={SPLASH_FAQ} heading="Spotlight mode: frequently asked questions" />
      <ModeFooterNav current="splash" />
    </>
  );
}
