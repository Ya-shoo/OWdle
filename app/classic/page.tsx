import { ClassicGame } from "@/components/ClassicGame";
import { modeJsonLd, modeMetadata } from "@/lib/site";

const META = {
  slug: "classic",
  title: "Classic",
  description:
    "Daily Overwatch hero quiz. Guess by role, age, country, species, HP and more. Each guess returns Wordle-style match tiles. Free, new puzzle daily.",
};

export const metadata = modeMetadata(META);

const jsonLd = modeJsonLd(META);

export default function ClassicPage() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c"),
        }}
      />
      <ClassicGame />
    </>
  );
}
