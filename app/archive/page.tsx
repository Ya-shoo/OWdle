import type { Metadata } from "next";
import { ArchiveHub } from "@/components/ArchiveHub";
import { ModeBreadcrumbs } from "@/components/ModeBreadcrumbs";

// The Archive HUB is indexable: it's a server-rendered landing page that
// describes the replay feature in full prose and reveals no puzzle content.
// The per-mode replay routes underneath it (/archive/classic/, /archive/
// sound/) stay noindex + disallowed — they're client-only game surfaces that
// render an empty shell to a crawler, so indexing them would just add more
// thin pages. Keep that split when new archive modes land.
export const metadata: Metadata = {
  title: "Archive",
  description:
    "Replay past daily OWdle puzzles. Catch up on a day you missed, or turn a loss into a win. Archive rounds never affect your streak.",
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
