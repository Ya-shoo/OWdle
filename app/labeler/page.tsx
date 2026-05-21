import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Labeler } from "@/components/Labeler";

// Audio labeler — first tool under OWdle's local dev hub. The shared
// /labeler/layout.tsx renders the cross-tool nav and the dev-only gate;
// this page just owns the tool's body.
const IS_DEV = process.env.NODE_ENV !== "production";

export const metadata: Metadata = IS_DEV
  ? {
      title: "Audio labeler — OWdle dev hub",
      robots: { index: false, follow: false },
    }
  : {};

export default function LabelerPage() {
  if (!IS_DEV) notFound();
  return <Labeler />;
}
