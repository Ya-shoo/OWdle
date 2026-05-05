import type { Metadata } from "next";
import { Labeler } from "@/components/Labeler";

export const metadata: Metadata = {
  title: "Labeler — OWdle",
  robots: { index: false, follow: false },
};

export default function LabelerPage() {
  return <Labeler />;
}
