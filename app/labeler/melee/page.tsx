import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Labeler } from "@/components/Labeler";

// Melee labeler — the one-clip-per-hero sibling of the audio labeler
// (`/labeler/sound/`). Same timeline + ffmpeg + zip engine, driven in
// `melee` mode: locked "melee" label, roster-completion flow, and a flat
// `melee/<hero>.{mp4,mp3}` export so melee clips never leak into Sound
// mode's answer pool. WIP feeding a future Melee game mode. The standard
// dev-only gate keeps the prod static export emitting a 404 for the route.

const IS_DEV = process.env.NODE_ENV !== "production";

export const metadata: Metadata = IS_DEV
  ? {
      title: "Melee labeler — OWdle dev hub",
      robots: { index: false, follow: false },
    }
  : {};

export default function MeleeLabelerPage() {
  if (!IS_DEV) notFound();
  return <Labeler mode="melee" />;
}
