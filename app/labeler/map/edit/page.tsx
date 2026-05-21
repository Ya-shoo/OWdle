import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { MapEdit, type SpotsByMap } from "@/components/MapEdit";
import spotsData from "@/data/spots.json";

const IS_DEV = process.env.NODE_ENV !== "production";

export const metadata: Metadata = IS_DEV
  ? {
      title: "Map edit — OWdle dev hub",
      robots: { index: false, follow: false },
    }
  : {};

// JSON imports re-evaluate on HMR in `next dev`, so after a save the
// page hot-reloads with the fresh data from disk. The static-export
// build also tolerates this import — the prod bundle just freezes to
// whatever spots.json contained at build time.
export default function MapEditPage() {
  if (!IS_DEV) notFound();
  return <MapEdit initialSpots={spotsData as SpotsByMap} />;
}
