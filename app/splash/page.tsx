import { SplashGame } from "@/components/SplashGame";
import { modeMetadata } from "@/lib/site";

export const metadata = modeMetadata({
  slug: "splash",
  title: "Spotlight",
  description:
    "Identify the Overwatch hero from a cropped sliver of splash art. The image zooms out with each guess. A daily Overwatch splash art and skin quiz.",
});

export default function SplashPage() {
  return <SplashGame />;
}
