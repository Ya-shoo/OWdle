import { ClassicGame } from "@/components/ClassicGame";
import { modeMetadata } from "@/lib/site";

export const metadata = modeMetadata({
  slug: "classic",
  title: "Classic",
  description:
    "Guess the daily Overwatch hero by attributes — role, age, country, gender, species, release year, HP, and more. Each guess returns wordle-style match tiles.",
});

export default function ClassicPage() {
  return <ClassicGame />;
}
