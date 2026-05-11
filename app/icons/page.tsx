import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { IconPicker } from "@/components/IconPicker";

// Internal icon-assignment tool — kept out of production builds. Renders
// only when running locally (`npm run dev`); a production prerender hits
// the notFound() branch so the static export emits a 404 for /icons/.
const IS_DEV = process.env.NODE_ENV !== "production";

export const metadata: Metadata = IS_DEV
  ? {
      title: "Icon picker — OWdle",
      robots: { index: false, follow: false },
    }
  : {};

export default function IconsPage() {
  if (!IS_DEV) notFound();
  return <IconPicker />;
}
