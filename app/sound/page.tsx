import { SoundGame } from "@/components/SoundGame";
import { modeMetadata } from "@/lib/site";

export const metadata = modeMetadata({
  slug: "sound",
  title: "Sound",
  description:
    "Identify the Overwatch hero from a short voice line. The audio clip lengthens with each miss. A daily Overwatch voice line and sound effect quiz.",
});

export default function SoundPage() {
  return <SoundGame />;
}
