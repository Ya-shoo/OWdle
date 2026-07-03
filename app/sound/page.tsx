import { SoundGame } from "@/components/SoundGame";
import { ModeBreadcrumbs } from "@/components/ModeBreadcrumbs";
import { ModeFooterNav } from "@/components/ModeFooterNav";
import { modeJsonLd, modeMetadata } from "@/lib/site";

const META = {
  slug: "sound",
  title: "Sound",
  seoTitle: "Overwatch Ability Sound Quiz",
  description:
    "Can you name the Overwatch hero from just an ability sound? Each miss plays a little more. New audio puzzle, fresh hero every day.",
};

export const metadata = modeMetadata(META);

const jsonLd = modeJsonLd(META);

export default function SoundPage() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c"),
        }}
      />
      <ModeBreadcrumbs label={META.title} />
      <SoundGame />
      <ModeFooterNav current="sound" />
    </>
  );
}
