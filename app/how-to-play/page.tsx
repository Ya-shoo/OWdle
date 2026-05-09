import Link from "next/link";
import { SITE_NAME, SITE_URL, modeMetadata } from "@/lib/site";

export const metadata = modeMetadata({
  slug: "how-to-play",
  title: "How to play",
  description:
    "How to play OWdle, the daily Overwatch hero quiz. Rules, tile colors, strategy tips, and a breakdown of all five wordle-style game modes: Classic, Quote, Ability, Spotlight, and Sound.",
});

const FAQS: { q: string; a: string }[] = [
  {
    q: "Is OWdle free?",
    a: "Yes. OWdle is free, has no ads, requires no account, and stores your progress only in your own browser. Nothing is sent to a server.",
  },
  {
    q: "When does the daily puzzle reset?",
    a: "Midnight UTC. Every mode rolls over to a new puzzle simultaneously, so every player in the world is solving the same hero on the same day.",
  },
  {
    q: "How is the daily hero chosen?",
    a: "A deterministic shuffle keyed to the calendar date. The same date always yields the same hero, and the order won't repeat for years. The daily lineup is identical for everyone, which is what makes streaks and shareable scores work.",
  },
  {
    q: "What do the tile colors mean in Classic?",
    a: "Green means an exact match: the guess and the answer share that attribute. Yellow means a partial match: same role family, neighboring continent, or a numeric value within a small window (HP, age, release year). Red means it's wrong, with arrows for higher/lower on numeric attributes.",
  },
  {
    q: "Does it work on mobile?",
    a: "Yes. Every mode is designed to work on a phone first: combobox autocomplete, tap-friendly tiles, and audio that respects silent mode.",
  },
  {
    q: "Are new heroes added when Blizzard releases them?",
    a: "Yes. The hero roster is rebuilt from the OverFast API plus a hand-curated overlay, so new heroes appear in the puzzle pool soon after they go live in Overwatch 2.",
  },
  {
    q: "What if I get stuck?",
    a: "There's no skip. The design is one shot per day, win or learn. Each mode does reveal more information per guess, so even a long run gives you better odds. You can always come back tomorrow.",
  },
  {
    q: "Is OWdle affiliated with Blizzard?",
    a: "No. OWdle is an unofficial fan project. Overwatch is a trademark of Blizzard Entertainment, Inc. Hero data is sourced from public APIs and the Overwatch Fandom wiki.",
  },
];

const PAGE_URL = `${SITE_URL}/how-to-play/`;

const jsonLd = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "FAQPage",
      "@id": `${PAGE_URL}#faq`,
      mainEntity: FAQS.map((f) => ({
        "@type": "Question",
        name: f.q,
        acceptedAnswer: { "@type": "Answer", text: f.a },
      })),
    },
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
  ],
};

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
    lede: "The signature wordle-style mode. Type a hero, get tiles back.",
    body: (
      <>
        <p>
          You have unlimited guesses to identify the daily hero. Each guess
          returns eight tiles, one per attribute, colored by how close that
          attribute is to the answer.
        </p>
        <p>
          The eight categories are{" "}
          <strong className="text-ink">role</strong>,{" "}
          <strong className="text-ink">subrole</strong>,{" "}
          <strong className="text-ink">gender</strong>,{" "}
          <strong className="text-ink">species</strong>,{" "}
          <strong className="text-ink">continent</strong>,{" "}
          <strong className="text-ink">age</strong>,{" "}
          <strong className="text-ink">HP</strong>, and{" "}
          <strong className="text-ink">release year</strong>. Green is an exact
          match. Yellow is partial: same role family, neighboring continent,
          or a numeric value within a window. Red is wrong, with arrows on
          numeric tiles pointing toward the answer.
        </p>
      </>
    ),
  },
  {
    slug: "quote",
    num: "02",
    label: "Quote",
    lede: "A pre-match exchange between two heroes. Identify both speakers.",
    body: (
      <>
        <p>
          You're shown two lines of in-game dialogue, one from each speaker, in
          the format Overwatch uses before a match begins. Your job is to name
          both heroes: the speaker and the addressee.
        </p>
        <p>
          The exchange is real game audio transcribed faithfully, so accents,
          callouts, and personality cues are all fair clues. A correct first
          guess locks that speaker in; you only need to keep guessing for the
          other.
        </p>
      </>
    ),
  },
  {
    slug: "ability",
    num: "03",
    label: "Ability",
    lede: "An ability icon, gradually revealed. Which hero owns it?",
    body: (
      <>
        <p>
          The puzzle starts with a tightly cropped, heavily blurred ability
          icon. Each wrong guess reveals more of it (wider crop, sharper
          detail) until you've identified the hero.
        </p>
        <p>
          A few abilities are obvious at first frame (Tracer's Recall, Reaper's
          Wraith Form). Most aren't. The mode rewards knowing kits across the
          full roster, including supports and tanks whose icons rarely make
          highlight reels.
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
          You start with a small rectangular crop of a hero's splash art or
          skin. Each guess zooms the camera out a step, revealing more of the
          composition until the full piece is visible.
        </p>
        <p>
          The crop sometimes lands on a costume detail rather than a face, so
          knowing legendary skins helps. The pool covers base portraits and
          curated skins (over a thousand total), so even veteran players run
          into pieces they haven't seen.
        </p>
      </>
    ),
  },
  {
    slug: "sound",
    num: "05",
    label: "Sound",
    lede: "A short voice line, lengthening with each miss.",
    body: (
      <>
        <p>
          You hear a fragment of a voice line, sometimes mid-syllable, often
          under a second. Each wrong guess plays a longer clip from the same
          line.
        </p>
        <p>
          Voice acting is the strongest hero-identity signal in Overwatch, so
          the early clip is genuinely hard. Knowing localizations helps:
          dialogue is presented in its original language, and a hero's accent
          alone can be the giveaway.
        </p>
      </>
    ),
  },
];

const TIPS = [
  {
    label: "Spread your first guess",
    body: "In Classic, start with a hero whose attributes split the roster. A damage hero from Asia in their twenties, for example, narrows the field much faster than a famous tank.",
  },
  {
    label: "Use yellow tiles aggressively",
    body: "A yellow continent or partial role is more information than a green tile on a generic attribute. Pivot toward that family next.",
  },
  {
    label: "In Quote, listen for accent and tone",
    body: "Even short lines carry vowel patterns and cadence that pin a hero down. Localized voice acting in Overwatch is unusually distinct.",
  },
  {
    label: "Don't burn guesses you don't need",
    body: "Each mode reveals more on every miss. If you're unsure between two heroes, picking one and learning from the result is often better than guessing wildly.",
  },
];

export default function HowToPlayPage() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <main className="flex-1">
        <section className="border-b border-line">
          <div className="mx-auto max-w-4xl px-6 pb-14 pt-16 sm:pt-20">
            <p className="font-mono text-xs uppercase tracking-[0.22em] text-info">
              Guide · Daily Overwatch Quiz
            </p>
            <h1 className="mt-5 font-display display-headline text-5xl leading-[0.95] text-ink sm:text-6xl">
              How to play <span className="text-accent">OWdle</span>
            </h1>
            <p className="mt-6 max-w-2xl text-lg leading-relaxed text-ink-soft">
              OWdle is a daily Overwatch hero quiz. Five modes, one hero per
              day, midnight-UTC reset. Every mode is wordle-style: your
              guesses tell you how close you are, and you keep going until you
              land it.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-6 font-mono text-xs uppercase tracking-[0.2em] text-ink-faint">
              <span>5 modes</span>
              <span className="h-px w-6 bg-line" aria-hidden />
              <span>1 puzzle per mode per day</span>
              <span className="h-px w-6 bg-line" aria-hidden />
              <span>resets 00:00 utc</span>
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-4xl px-6 pt-16 sm:pt-20">
          <header className="mb-10 flex items-baseline justify-between border-b border-line pb-3">
            <h2 className="font-mono text-xs uppercase tracking-[0.22em] text-info">
              The daily loop
            </h2>
            <span className="font-mono text-xs text-ink-faint">3 rules</span>
          </header>
          <ul className="grid gap-px bg-line sm:grid-cols-3">
            <RuleCard
              num="i"
              label="Same hero for everyone"
              body="A deterministic shuffle keyed to the date. The hero you're solving today is the same one every other player is solving."
            />
            <RuleCard
              num="ii"
              label="Progress saves locally"
              body="Your guesses, win state, and streak live in your browser. Open OWdle on a different device and you'll start the day fresh there."
            />
            <RuleCard
              num="iii"
              label="One reset, all modes"
              body="At 00:00 UTC every mode rolls over together. There's no rush. Solve at your own pace within the day."
            />
          </ul>
        </section>

        <section className="mx-auto max-w-4xl px-6 pt-20 sm:pt-24">
          <header className="mb-12 flex items-baseline justify-between border-b border-line pb-3">
            <h2 className="font-mono text-xs uppercase tracking-[0.22em] text-info">
              The five modes
            </h2>
            <span className="font-mono text-xs text-ink-faint">
              Canonical play order
            </span>
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
                  <p className="mt-2 font-mono text-xs uppercase tracking-[0.18em] text-info">
                    {mode.lede}
                  </p>
                  <div className="mt-5 space-y-4 text-base leading-relaxed text-ink-soft [&_p]:[text-wrap:pretty]">
                    {mode.body}
                  </div>
                  <Link
                    href={`/${mode.slug}/`}
                    className="mt-6 inline-flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.22em] text-accent-soft transition-colors hover:text-accent"
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

        <section className="mx-auto max-w-4xl px-6 pt-20 sm:pt-24">
          <header className="mb-10 flex items-baseline justify-between border-b border-line pb-3">
            <h2 className="font-mono text-xs uppercase tracking-[0.22em] text-info">
              Tips
            </h2>
            <span className="font-mono text-xs text-ink-faint">
              {TIPS.length} starters
            </span>
          </header>
          <ul className="grid gap-px bg-line sm:grid-cols-2">
            {TIPS.map((tip) => (
              <li key={tip.label} className="bg-canvas p-6">
                <h3 className="font-display text-xl text-ink">{tip.label}</h3>
                <p className="mt-2 text-sm leading-relaxed text-ink-soft">
                  {tip.body}
                </p>
              </li>
            ))}
          </ul>
        </section>

        <section className="mx-auto max-w-4xl px-6 pb-20 pt-20 sm:pb-24 sm:pt-24">
          <header className="mb-10 flex items-baseline justify-between border-b border-line pb-3">
            <h2 className="font-mono text-xs uppercase tracking-[0.22em] text-info">
              FAQ
            </h2>
            <span className="font-mono text-xs text-ink-faint">
              {FAQS.length} answers
            </span>
          </header>
          <div className="divide-y divide-line border-y border-line">
            {FAQS.map((f) => (
              <details key={f.q} className="group">
                <summary className="flex cursor-pointer items-baseline justify-between gap-6 px-1 py-5 text-left transition-colors hover:bg-muted/30 [&::-webkit-details-marker]:hidden">
                  <span className="font-display text-lg text-ink sm:text-xl">
                    {f.q}
                  </span>
                  <span
                    aria-hidden
                    className="font-mono text-sm text-ink-faint transition-transform group-open:rotate-45"
                  >
                    +
                  </span>
                </summary>
                <p className="px-1 pb-6 pr-12 text-base leading-relaxed text-ink-soft [text-wrap:pretty]">
                  {f.a}
                </p>
              </details>
            ))}
          </div>
        </section>

        <section className="border-t border-line bg-inset/40">
          <div className="mx-auto flex max-w-4xl flex-col items-start gap-6 px-6 py-12 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="font-mono text-xs uppercase tracking-[0.22em] text-info">
                Ready
              </p>
              <p className="mt-2 font-display text-2xl text-ink sm:text-3xl">
                Begin with the daily Classic puzzle.
              </p>
            </div>
            <Link
              href="/classic/"
              className="group relative inline-flex"
              aria-label="Begin with Classic mode"
            >
              <span
                aria-hidden
                className="pointer-events-none absolute -inset-2 opacity-0 blur-2xl transition-opacity duration-300 group-hover:opacity-100"
                style={{ background: "rgba(255, 164, 102, 0.32)" }}
              />
              <span
                className="relative inline-flex items-center gap-4 bg-muted px-8 py-4 font-display text-base font-bold uppercase tracking-[0.14em] shadow-xl shadow-black/50 transition-transform duration-200 group-hover:-translate-y-0.5"
                style={{
                  clipPath:
                    "polygon(0 0, calc(100% - 14px) 0, 100% 14px, 100% 100%, 14px 100%, 0 calc(100% - 14px))",
                }}
              >
                <svg
                  aria-hidden
                  width="10"
                  height="12"
                  viewBox="0 0 10 12"
                  className="shrink-0 text-accent-soft"
                >
                  <polygon points="0,0 10,6 0,12" fill="currentColor" />
                </svg>
                <span>
                  <span className="text-ink-soft">Begin with </span>
                  <span className="text-accent-soft">Classic</span>
                </span>
                <svg
                  aria-hidden
                  width="18"
                  height="12"
                  viewBox="0 0 18 12"
                  className="shrink-0 text-accent-soft transition-transform duration-200 group-hover:translate-x-1"
                >
                  <path
                    d="M0 6 L16 6 M11 1 L17 6 L11 11"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="square"
                    strokeLinejoin="miter"
                  />
                </svg>
              </span>
            </Link>
          </div>
        </section>
      </main>
    </>
  );
}

function RuleCard({
  num,
  label,
  body,
}: {
  num: string;
  label: string;
  body: string;
}) {
  return (
    <li className="bg-canvas p-6">
      <p className="font-mono text-xs uppercase tracking-[0.22em] text-accent">
        {num}
      </p>
      <h3 className="mt-3 font-display text-xl text-ink">{label}</h3>
      <p className="mt-2 text-sm leading-relaxed text-ink-soft">{body}</p>
    </li>
  );
}
