import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Labeler } from "@/components/Labeler";

// Internal labeling tool — kept out of production builds. Renders only
// when running locally (`npm run dev`); a production prerender hits the
// notFound() branch and the static export emits a 404 for /labeler/.
const IS_DEV = process.env.NODE_ENV !== "production";

export const metadata: Metadata = IS_DEV
  ? {
      title: "Labeler — OWdle",
      robots: { index: false, follow: false },
    }
  : {};

export default function LabelerPage() {
  if (!IS_DEV) notFound();
  return <Labeler />;
}
