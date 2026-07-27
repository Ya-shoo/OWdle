import Link from "next/link";

// Site-wide attribution + disclaimer footer, rendered from the root
// layout so every page carries it. `mt-auto` pins it to the viewport
// bottom on short pages (body is min-h-full flex-col).
export function SiteFooter() {
  return (
    <footer className="mt-auto border-t border-line bg-inset">
      <div className="mx-auto flex max-w-6xl flex-col gap-3 px-6 py-5 text-xs text-ink-faint sm:flex-row sm:items-center sm:justify-between">
        <div className="max-w-3xl text-[10px] leading-relaxed">
          Sources:{" "}
          <a
            className="underline-offset-2 hover:underline"
            href="https://overfast-api.tekrop.fr/"
          >
            OverFast API
          </a>
          ,{" "}
          <a
            className="underline-offset-2 hover:underline"
            href="https://overwatch.fandom.com/"
          >
            Overwatch Fandom wiki
          </a>{" "}
          (CC-BY-SA), Blizzard press kit.{" "}
          <span className="text-ink-soft">
            OWdle claims no ownership whatsoever of any assets used on
            this site. Overwatch and all related characters, artwork,
            audio, and other assets are © and ™ Blizzard Entertainment,
            Inc., and all rights remain with their respective owners.
          </span>{" "}
          OWdle is an unofficial fan project, not endorsed by or
          affiliated with Blizzard.{" · "}
          <Link
            href="/privacy/"
            className="underline-offset-2 transition-colors hover:text-accent hover:underline"
          >
            Privacy
          </Link>
          {" · "}
          <Link
            href="/contact/"
            className="underline-offset-2 transition-colors hover:text-accent hover:underline"
          >
            Contact
          </Link>
        </div>
        {/* Quiet secondary nav — the deliberately low-key entry to the
            About + Guides sub-pages (kept off the homepage body so they
            don't compete with the modes). How to play keeps its accent as
            the primary next step; About/Guides stay faint. */}
        {/* pr on wide screens keeps the last link clear of the fixed
            bottom-right Feedback button, which otherwise overlaps it. */}
        <nav
          aria-label="Secondary"
          className="flex flex-wrap items-center gap-x-4 gap-y-2 whitespace-nowrap sm:pr-32"
        >
          <Link
            href="/about/"
            className="utility-label text-ink-faint transition-colors hover:text-accent"
          >
            About
          </Link>
          <Link
            href="/guides/"
            className="utility-label text-ink-faint transition-colors hover:text-accent"
          >
            Guides
          </Link>
          <Link
            href="/heroes/"
            className="utility-label text-ink-faint transition-colors hover:text-accent"
          >
            Heroes
          </Link>
          <Link
            href="/how-to-play/"
            className="utility-label text-accent-soft transition-colors hover:text-accent"
          >
            How to play →
          </Link>
        </nav>
      </div>
    </footer>
  );
}
