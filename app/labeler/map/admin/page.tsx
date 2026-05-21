import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { MapAdmin } from "@/components/MapAdmin";

const IS_DEV = process.env.NODE_ENV !== "production";

export const metadata: Metadata = IS_DEV
  ? {
      title: "Map feedback admin — OWdle dev hub",
      robots: { index: false, follow: false },
    }
  : {};

export default function MapAdminPage() {
  if (!IS_DEV) notFound();
  return <MapAdmin />;
}
