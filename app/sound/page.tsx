import { SoundGame } from "@/components/SoundGame";
import { modeJsonLd, modeMetadata } from "@/lib/site";

const META = {
  slug: "sound",
  title: "Sound",
  description:
    "Identify the Overwatch hero from a short voice line. The audio clip lengthens with each miss. A daily Overwatch voice line and sound effect quiz.",
};

export const metadata = modeMetadata(META);

const jsonLd = modeJsonLd(META);

export default function SoundPage() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <SoundGame />
    </>
  );
}
