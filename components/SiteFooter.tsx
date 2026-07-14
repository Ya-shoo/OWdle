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
        </div>
        <Link
          href="/how-to-play/"
          className="utility-label text-accent-soft transition-colors hover:text-accent"
        >
          How to play →
        </Link>
      </div>
    </footer>
  );
}
