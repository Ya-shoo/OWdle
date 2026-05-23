import Link from "next/link";
import { MODES, type ModeSlug } from "@/lib/modes";

// Cross-mode footer that sits at the bottom of every mode page. Internal
// PageRank previously only flowed home → mode; this gives mode → mode and
// mode → /how-to-play paths to every built sibling. All labels reuse the
// existing copy in lib/modes.ts and HomeContent so we don't introduce new
// surface strings here.
export function ModeFooterNav({ current }: { current: ModeSlug }) {
  const siblings = MODES.filter((m) => m.built && m.slug !== current);

  return (
    <section className="mt-16 border-t border-line sm:mt-24">
      <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6 sm:py-16">
        <h2 className="font-mono text-xs uppercase tracking-[0.22em] text-info">
          Modes
        </h2>
        <ul className="mt-6 grid gap-px bg-line sm:grid-cols-2 lg:grid-cols-4">
          {siblings.map((m) => (
            <li key={m.slug} className="group bg-canvas">
              <Link
                href={`/${m.slug}/`}
                className="flex h-full flex-col gap-3 p-5 transition-colors hover:bg-inset"
              >
                <div className="font-display text-xl text-ink">{m.label}</div>
                <p className="text-sm leading-relaxed text-ink-soft">
                  {m.blurb}
                </p>
                <span className="mt-auto inline-flex items-center font-mono text-[11px] uppercase tracking-[0.2em] text-accent-soft transition-colors group-hover:text-accent">
                  Play →
                </span>
              </Link>
            </li>
          ))}
        </ul>
        <div className="mt-8 flex justify-end font-mono text-xs uppercase tracking-[0.2em]">
          <Link
            href="/how-to-play/"
            className="text-ink-faint transition-colors hover:text-accent"
          >
            How to play →
          </Link>
        </div>
      </div>
    </section>
  );
}
