import Link from "next/link";
import { ModeBreadcrumbs } from "@/components/ModeBreadcrumbs";
import { SITE_NAME, SITE_URL, modeMetadata } from "@/lib/site";

const PAGE_DESCRIPTION =
  "How to play OWdle, the daily Overwatch hero quiz. Rules, tile colors, and a breakdown of all five wordle-style game modes: Classic, Quote, Ability, Spotlight, and Sound.";

export const metadata = modeMetadata({
  slug: "how-to-play",
  title: "How to play",
  description: PAGE_DESCRIPTION,
});

const PAGE_URL = `${SITE_URL}/how-to-play/`;

const MODE_SECTIONS: {
  slug: string;
  num: string;
  label: string;
  lede: string;
  body: React.ReactNode;
}[] = [
  {
    slug: "classic",
    num: "01",
    label: "Classic",
    lede: "Type a hero, get attribute tiles back.",
    body: (
      <>
        <p>
          You have eight guesses to identify the daily hero. Each guess
          returns eight attribute tiles colored by closeness to the answer,
          and two optional hints are available as you go.
        </p>
      </>
    ),
  },
  {
    slug: "quote",
    num: "02",
    label: "Quote",
    lede: "Two heroes talk before a match. Identify both speakers.",
    body: (
      <>
        <p>
          You see two lines of dialogue from the moments before a match, and
          you have eight guesses to name both speakers. Naming one correctly
          locks that speaker in so you can focus your remaining guesses on
          the other.
        </p>
      </>
    ),
  },
  {
    slug: "ability",
    num: "03",
    label: "Ability",
    lede: "A blurred ability icon that sharpens with each miss.",
    body: (
      <>
        <p>
          The puzzle starts with a tightly cropped, heavily blurred ability
          icon that widens and sharpens with each wrong guess. You have
          fourteen attempts to name the hero who owns it.
        </p>
      </>
    ),
  },
  {
    slug: "splash",
    num: "04",
    label: "Spotlight",
    lede: "A cropped sliver of hero or skin art. It zooms out as you guess.",
    body: (
      <>
        <p>
          A small crop of a hero splash or skin that zooms out a step with
          each wrong guess. You have five attempts across a pool that covers
          base portraits and over a thousand curated skins.
        </p>
      </>
    ),
  },
  {
    slug: "sound",
    num: "05",
    label: "Sound",
    lede: "A voice line clip that grows longer with each miss.",
    body: (
      <>
        <p>
          You hear a fragment of a voice line, often under a second, that
          grows longer with each wrong guess. You have eight attempts, and
          dialogue plays in its original language so accents are fair clues.
        </p>
      </>
    ),
  },
];

const jsonLd = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "BreadcrumbList",
      "@id": `${PAGE_URL}#breadcrumbs`,
      itemListElement: [
        {
          "@type": "ListItem",
          position: 1,
          name: SITE_NAME,
          item: SITE_URL,
        },
        {
          "@type": "ListItem",
          position: 2,
          name: "How to play",
          item: PAGE_URL,
        },
      ],
    },
    {
      "@type": "HowTo",
      "@id": `${PAGE_URL}#howto`,
      name: "How to play OWdle",
      description: PAGE_DESCRIPTION,
      totalTime: "PT10M",
      supply: [{ "@type": "HowToSupply", name: "A web browser" }],
      step: MODE_SECTIONS.map((mode, i) => ({
        "@type": "HowToStep",
        position: i + 1,
        name: mode.label,
        text: mode.lede,
        url: `${SITE_URL}/${mode.slug}/`,
      })),
    },
  ],
};

export default function HowToPlayPage() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c"),
        }}
      />
      <ModeBreadcrumbs label="How to play" />
      <main className="flex-1">
        <section className="border-b border-line">
          <div className="mx-auto max-w-4xl px-6 pb-14 pt-16 sm:pt-20">
            <p className="font-mono text-xs uppercase tracking-[0.22em] text-info">
              Guide · Daily Overwatch Quiz
            </p>
            <h1 className="mt-5 font-display display-headline text-5xl leading-[0.95] text-ink sm:text-6xl">
              How to play <span className="text-accent">OWdle</span>
            </h1>
          </div>
        </section>

        <section className="mx-auto max-w-4xl px-6 pt-20 sm:pt-24">
          <header className="mb-12 border-b border-line pb-3">
            <h2 className="font-mono text-xs uppercase tracking-[0.22em] text-info">
              The five modes
            </h2>
          </header>

          <div className="space-y-16 sm:space-y-20">
            {MODE_SECTIONS.map((mode) => (
              <article
                key={mode.slug}
                className="grid gap-6 sm:grid-cols-[auto_1fr] sm:gap-10"
              >
                <div className="font-display text-6xl leading-none text-ink-faint sm:text-7xl">
                  {mode.num}
                </div>
                <div>
                  <h3 className="font-display display-headline text-3xl text-ink">
                    {mode.label}
                  </h3>
                  <p className="mt-2 font-mono text-xs uppercase tracking-[0.18em] text-accent-soft">
                    {mode.lede}
                  </p>
                  <div className="mt-5 space-y-4 text-base leading-relaxed text-ink-soft [&_p]:[text-wrap:pretty]">
                    {mode.body}
                  </div>
                  <Link
                    href={`/${mode.slug}/`}
                    className="mt-6 inline-flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.22em] text-correct transition-colors hover:text-info"
                  >
                    Play {mode.label}
                    <svg
                      aria-hidden
                      width="16"
                      height="10"
                      viewBox="0 0 16 10"
                      className="transition-transform group-hover:translate-x-0.5"
                    >
                      <path
                        d="M0 5 L13 5 M9 1 L14 5 L9 9"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.5"
                        strokeLinecap="square"
                      />
                    </svg>
                  </Link>
                </div>
              </article>
            ))}
          </div>
        </section>

        <section className="mt-14 border-t border-line bg-inset/40 sm:mt-16">
          <div className="mx-auto flex max-w-4xl flex-wrap items-center justify-center gap-x-5 gap-y-3 px-6 py-7">
            <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-info">
              Ready?
            </p>
            <p className="font-display text-xl text-ink-soft sm:text-2xl">
              Begin with
            </p>
            <Link
              href="/classic/"
              className="group relative inline-flex"
              aria-label="Begin with Classic mode"
            >
              <span className="relative inline-flex items-center gap-2.5 rounded-full bg-accent px-5 py-2.5 font-display text-sm font-bold uppercase tracking-[0.18em] text-on-accent shadow-[0_2px_6px_-1px_rgba(0,0,0,0.4),0_0_4px_-1px_var(--accent)] transition-all duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] group-hover:scale-[1.04] group-hover:bg-accent-soft group-hover:shadow-[0_4px_12px_-2px_rgba(0,0,0,0.45),0_0_6px_-2px_var(--accent)] group-active:scale-[0.98] group-active:shadow-[0_1px_3px_-1px_rgba(0,0,0,0.35),0_0_2px_-1px_var(--accent)]">
                <svg
                  aria-hidden
                  width="8"
                  height="10"
                  viewBox="0 0 10 12"
                  className="shrink-0 text-on-accent"
                >
                  <polygon points="0,0 10,6 0,12" fill="currentColor" />
                </svg>
                <span>Classic</span>
              </span>
            </Link>
          </div>
        </section>
      </main>
    </>
  );
}

