import { Suspense } from "react";
import type { Metadata } from "next";
import { ArchiveClassic } from "@/components/ArchiveClassic";
import { ModeBreadcrumbs } from "@/components/ModeBreadcrumbs";

// Archive is a private, client-only retention surface — NOT an SEO target.
// noindex/nofollow (belt-and-suspenders alongside the robots.txt disallow
// and the absence from the sitemap). No modeMetadata/modeJsonLd here.
export const metadata: Metadata = {
  title: "Classic Archive",
  description: "Replay the past week of daily Classic puzzles.",
  robots: { index: false, follow: false },
};

export default function ClassicArchivePage() {
  return (
    <>
      <ModeBreadcrumbs label="Archive" />
      <main className="mx-auto w-full max-w-2xl px-4 py-10 sm:px-6 lg:py-16">
        {/* useSearchParams (?d=) client-renders this subtree; the boundary is
            required for the static-export production build. */}
        <Suspense
          fallback={
            <div className="font-mono text-xs uppercase tracking-[0.2em] text-ink-faint">
              Loading…
            </div>
          }
        >
          <ArchiveClassic />
        </Suspense>
      </main>
    </>
  );
}
