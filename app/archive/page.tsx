import type { Metadata } from "next";
import { ArchiveHub } from "@/components/ArchiveHub";
import { ModeBreadcrumbs } from "@/components/ModeBreadcrumbs";

// Private, client-only retention surface — NOT an SEO target. noindex here,
// disallowed in robots.ts, and absent from the sitemap.
export const metadata: Metadata = {
  title: "Archive",
  description: "Replay past daily OWdle puzzles.",
  robots: { index: false, follow: false },
};

export default function ArchivePage() {
  return (
    <>
      <ModeBreadcrumbs label="Archive" />
      <main className="mx-auto w-full max-w-4xl px-4 py-10 sm:px-6 lg:py-16">
        <ArchiveHub />
      </main>
    </>
  );
}
