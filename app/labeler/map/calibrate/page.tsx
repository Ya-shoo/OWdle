import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { MapCalibrate } from "@/components/MapCalibrate";

// Mirrors the gate on the other /labeler/* tools: the route still exists
// in the static export, but the page itself 404s in production so the
// emitted HTML is the not-found shell rather than the live tool.
const IS_DEV = process.env.NODE_ENV !== "production";

export const metadata: Metadata = IS_DEV
  ? {
      title: "Map calibrate — OWdle dev hub",
      robots: { index: false, follow: false },
    }
  : {};

export default function MapCalibratePage() {
  if (!IS_DEV) notFound();
  return <MapCalibrate />;
}
