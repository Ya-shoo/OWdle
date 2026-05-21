import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Labeler } from "@/components/Labeler";

// Audio labeler — the original /labeler/ tool, now living at its own
// sub-route so the hub-index page (`/labeler/`) can carry the cross-
// tool directory. The standard dev-only gate keeps the prod static
// export emitting a 404 for this route.

const IS_DEV = process.env.NODE_ENV !== "production";

export const metadata: Metadata = IS_DEV
  ? {
      title: "Audio labeler — OWdle dev hub",
      robots: { index: false, follow: false },
    }
  : {};

export default function SoundLabelerPage() {
  if (!IS_DEV) notFound();
  return <Labeler />;
}
