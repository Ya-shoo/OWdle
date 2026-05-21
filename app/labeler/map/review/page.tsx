import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { MapReview } from "@/components/MapReview";

const IS_DEV = process.env.NODE_ENV !== "production";

export const metadata: Metadata = IS_DEV
  ? {
      title: "Map review — OWdle dev hub",
      robots: { index: false, follow: false },
    }
  : {};

export default function MapReviewPage() {
  if (!IS_DEV) notFound();
  return <MapReview />;
}
