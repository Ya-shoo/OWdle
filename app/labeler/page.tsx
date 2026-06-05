import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

// Dev hub for OWdle. Every internal admin / labeling tool plus every
// live game mode shows up here so a developer never has to remember a
// URL — one bookmark (`/labeler/`) covers it all.
//
// Adding a new tool? Append it to TOOL_GROUPS below and put the page
// under app/labeler/<tool>/page.tsx with the standard
// `if (!IS_DEV) notFound()` gate so the prod static export emits a
// 404 for the route.

const IS_DEV = process.env.NODE_ENV !== "production";

export const metadata: Metadata = IS_DEV
  ? {
      title: "Dev hub — OWdle",
      robots: { index: false, follow: false },
    }
  : {};

const TOOL_GROUPS: ReadonlyArray<{
  title: string;
  blurb: string;
  tools: ReadonlyArray<{
    href: string;
    label: string;
    description: string;
    // Optional helper-server port. Surfaces as a footnote so you
    // remember which `node scripts/*-server.mjs` (or `concurrently`
    // task) needs to be running for the tool to work end-to-end.
    helper?: string;
  }>;
}> = [
  {
    title: "Map mode",
    blurb: "Capture, label, and review GeoGuessr-style spots.",
    tools: [
      {
        href: "/labeler/map/calibrate/",
        label: "Calibrate",
        description:
          "Solve a per-map (worldX, worldZ) → (pixelX, pixelY) homography. One-time per map.",
      },
      {
        href: "/labeler/map/review/",
        label: "Review",
        description:
          "Drop screenshots → OCR coords → auto-detect map → mask HUD → export ZIP.",
      },
      {
        href: "/labeler/map/edit/",
        label: "Edit",
        description:
          "Drag pins + rotate facing on every committed spot. Saves back to data/spots.json via the local spots-server.",
        helper: "localhost:3030",
      },
      {
        href: "/labeler/map/admin/",
        label: "Feedback admin",
        description:
          "Aggregated per-spot difficulty + pin-accuracy ratings.",
      },
    ],
  },
  {
    title: "Sound mode",
    blurb: "Cut, label, and trim hero ability voice / SFX clips.",
    tools: [
      {
        href: "/labeler/sound/",
        label: "Audio labeler",
        description:
          "Time-range cutter + label dictionary. ffmpeg.wasm in-browser, exports as ZIPs.",
      },
      {
        href: "/sound/",
        label: "Trimmer (in-game)",
        description:
          "DevSoundTrimmer is embedded in the live Sound mode page — adjust start/end offsets per clip and save back to data/sound-clip-trims.json. Visible only when NODE_ENV !== production.",
      },
    ],
  },
  {
    title: "Daily flow",
    blurb: "Visual previews of post-completion UI.",
    tools: [
      {
        href: "/labeler/tier-preview/",
        label: "Tier preview",
        description:
          "All 7 Overwatch rank badges + an editable 4/5 composite calculator that renders the resulting tier. Synthetic cutoffs; no /api/stats/today dependency.",
      },
      {
        href: "/labeler/streak-rank-preview/",
        label: "Streak rank preview",
        description:
          "Top 500 / Champion / Grandmaster streak badges, the header pill, the promotion modal, and the 1080² share card at a forced tier + streak. No /api/stats/streaks dependency.",
      },
      {
        href: "/labeler/share-preview/",
        label: "Share card preview",
        description:
          "Round + Quote 1080² share cards across hero / mode / outcome / skin knobs, plus the hero costume-palette editor (eyedropper) that writes data/hero-palettes.json.",
        helper: "localhost:8791",
      },
    ],
  },
  {
    title: "Site admin",
    blurb: "Live read-outs of submissions from the prod site.",
    tools: [
      {
        href: "/labeler/votes/",
        label: "Votes admin",
        description:
          "Live tally of next-game votes across OWdle + Deadlockle.",
        helper: "localhost:8788",
      },
      {
        href: "/labeler/feedback/",
        label: "Feedback admin",
        description:
          "Free-form feedback submissions, filterable by site + keywords.",
        helper: "localhost:8790",
      },
    ],
  },
  {
    title: "Play",
    blurb: "All game modes — handy to test changes end-to-end.",
    tools: [
      { href: "/", label: "Home", description: "Today's daily-progress dashboard." },
      { href: "/classic/", label: "Classic", description: "Hero attribute Wordle." },
      { href: "/quote/", label: "Quote", description: "Identify both speakers." },
      { href: "/ability/", label: "Ability", description: "Reveal-the-ability puzzle." },
      { href: "/splash/", label: "Spotlight", description: "Sliver of splash art." },
      { href: "/sound/", label: "Sound", description: "Voice line / SFX puzzle." },
      { href: "/map/", label: "Map", description: "Overwatch GeoGuessr (WIP, unlisted)." },
    ],
  },
];

export default function DevHub() {
  if (!IS_DEV) notFound();
  return (
    <main className="min-h-screen bg-bg text-ink">
      <div className="mx-auto max-w-[1200px] px-4 py-8 sm:px-6 sm:py-10 lg:px-8">
        <header className="mb-8">
          <p className="font-mono text-[10px] uppercase tracking-[0.24em] text-info">
            OWdle Dev
          </p>
          <h1 className="mt-1 font-display text-4xl text-ink sm:text-5xl">
            Local dev hub
          </h1>
          <p className="mt-2 font-mono text-[10px] uppercase tracking-[0.2em] text-ink-faint">
            every admin / labeling tool + every live mode · localhost only
          </p>
        </header>

        <div className="flex flex-col gap-10">
          {TOOL_GROUPS.map((group) => (
            <section key={group.title}>
              <div className="mb-3 flex items-baseline justify-between gap-3 border-b border-line pb-2">
                <h2 className="font-display text-2xl text-ink">{group.title}</h2>
                <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-faint">
                  {group.tools.length} tool{group.tools.length === 1 ? "" : "s"}
                </p>
              </div>
              <p className="mb-4 font-mono text-[10px] uppercase tracking-[0.18em] text-ink-soft">
                {group.blurb}
              </p>
              <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {group.tools.map((tool) => (
                  <li key={tool.href}>
                    <Link
                      href={tool.href}
                      className="block h-full rounded-(--radius-card) border border-line bg-inset/40 p-4 transition-colors hover:border-accent hover:bg-inset/70"
                    >
                      <div className="flex items-baseline justify-between gap-2">
                        <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-accent">
                          {tool.label}
                        </p>
                        <span
                          aria-hidden
                          className="font-mono text-[10px] text-ink-faint"
                        >
                          →
                        </span>
                      </div>
                      <p className="mt-2 font-mono text-[10px] leading-relaxed tracking-[0.12em] text-ink-soft">
                        {tool.description}
                      </p>
                      <div className="mt-3 flex items-baseline justify-between gap-2">
                        <p className="truncate font-mono text-[9px] uppercase tracking-[0.16em] text-ink-faint/70">
                          {tool.href}
                        </p>
                        {tool.helper && (
                          <p className="shrink-0 font-mono text-[9px] uppercase tracking-[0.16em] text-info/70">
                            helper: {tool.helper}
                          </p>
                        )}
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>

        <footer className="mt-12 border-t border-line pt-4 font-mono text-[9px] uppercase tracking-[0.18em] text-ink-faint">
          run <code className="text-ink-soft">npm run dev</code> in{" "}
          <code className="text-ink-soft">C:\Users\yashp\OWdle</code> if the
          server isn&apos;t already up. ports default to 3000.
        </footer>
      </div>
    </main>
  );
}
