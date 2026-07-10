import Link from "next/link";

// A short, real-voice note from the site's maker. This is the homepage's
// primary "fan, not operator" signal: who built OWdle and why, in Yush's
// own voice. Sits between the modes grid and the FAQ so a first-time
// visitor meets the human before any support / network asks lower down.
// Deliberately a personal note, not a card that looks like an ad — solid
// bg-muted surface, small inset avatar, sparse em dashes. The one internal
// link points at Sound (the origin mode) since the story names it.
export function MakerNote() {
  return (
    <div className="rounded-(--radius-card) border border-line bg-muted p-6 shadow-card sm:p-8">
      <div className="flex flex-col items-start gap-5 sm:flex-row sm:gap-6">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/kofi-avatar.jpg?v=2"
          alt=""
          width={80}
          height={80}
          className="h-16 w-16 shrink-0 rounded-full border border-line object-cover sm:h-20 sm:w-20"
        />
        <div>
          <p className="utility-label text-xs text-info">From the maker</p>
          <h2 className="mt-1 font-soft text-2xl font-bold text-ink">
            hi, I&rsquo;m Yush
          </h2>
          <div className="mt-3 space-y-3 text-[15px] leading-relaxed text-ink-soft [&_p]:[text-wrap:pretty]">
            <p>
              I built OWdle for me and my friends. I started playing in Season
              9, when Mauga dropped, and the thing that kept killing me was
              sound. I&rsquo;d get caught by a D.Va bomb or a RIP-Tire I never
              learned to hear coming.
            </p>
            <p>
              So{" "}
              <Link
                href="/sound/"
                className="text-accent-soft underline underline-offset-2 transition-colors hover:text-accent"
              >
                Sound
              </Link>{" "}
              was the very first mode I made, and it&rsquo;s still my favorite. I
              went looking for other Overwatch guessing games, none of them
              scratched the itch, so I built my own. Hope you enjoy it.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
