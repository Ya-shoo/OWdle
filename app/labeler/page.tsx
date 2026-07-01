import type { Metadata } from "next";
import { notFound } from "next/navigation";

// Unified dev hub for the whole DailyDles network. OWdle hosts the master
// index (this page); Deadlockle's /labeler/ is a thin pointer back here.
// It's a dev-only launchpad — cross-site tools open the Deadlockle dev app
// on :3001 (badged "DL ↗"); OWdle's own tools are same-origin (:3000). The
// long per-mode test/preview lists collapse into <details> dropdowns.
//
// Adding a tool? Append to GROUPS below. For an OWdle tool, leave `site`
// unset and add the page under app/labeler/<tool>/page.tsx with the
// `if (!IS_DEV) notFound()` gate. For a Deadlockle tool, set
// `site: "deadlockle"` and it'll resolve against :3001.

const IS_DEV = process.env.NODE_ENV !== "production";
const DL = "http://localhost:3001"; // Deadlockle dev app

export const metadata: Metadata = IS_DEV
  ? { title: "Dev hub — DailyDles", robots: { index: false, follow: false } }
  : {};

type Tool = {
  href: string;
  label: string;
  description: string;
  site?: "owdle" | "deadlockle"; // default: owdle (same origin)
  helper?: string;
};
type Group = {
  title: string;
  blurb: string;
  collapsible?: boolean; // render as a closed <details> dropdown
  tools: Tool[];
};

const GROUPS: Group[] = [
  {
    title: "Map mode",
    blurb: "OWdle · capture, label, and review GeoGuessr-style spots.",
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
          "Drag pins + rotate facing on every committed spot. Saves to data/spots.json.",
        helper: "localhost:3030",
      },
      {
        href: "/labeler/map/admin/",
        label: "Feedback admin",
        description: "Aggregated per-spot difficulty + pin-accuracy ratings.",
      },
    ],
  },
  {
    title: "Sound mode",
    blurb: "OWdle · cut, label, and trim hero ability voice / SFX clips.",
    tools: [
      {
        href: "/labeler/sound/",
        label: "Audio labeler",
        description:
          "Time-range cutter + label dictionary. ffmpeg.wasm in-browser, exports ZIPs.",
      },
      {
        href: "/sound/",
        label: "Trimmer (in-game)",
        description:
          "DevSoundTrimmer embedded in the live Sound page — tweak per-clip start/end offsets.",
      },
    ],
  },
  {
    title: "Greeter preview",
    blurb: "Preview the home-page mascot greeter on each site.",
    tools: [
      {
        href: "/labeler/avatar-preview/",
        label: "OWdle greeter",
        description:
          "Mascot pop-in + wave + announcement bubble (and poll, when the pin has options). Replay + bubble toggle.",
      },
      {
        href: "/labeler/avatar-preview/",
        label: "Deadlockle greeter",
        site: "deadlockle",
        description: "Same preview, running in the Deadlockle dev app.",
      },
    ],
  },
  {
    title: "Votes · Feedback · Polls",
    blurb: "Cross-site submissions + greeter poll results (shared owdle-votes D1).",
    tools: [
      {
        href: "/labeler/votes/",
        label: "Votes admin",
        description: "Live tally of next-game votes across OWdle + Deadlockle.",
        helper: "localhost:8788",
      },
      {
        href: "/labeler/feedback/",
        label: "Feedback admin",
        description: "Free-form feedback, filterable by site + keywords.",
        helper: "localhost:8790",
      },
      {
        href: "/labeler/polls/",
        label: "Poll results",
        description:
          "Vote counts for every greeter mini-poll, OWdle/Deadlockle split + live % bars.",
      },
    ],
  },
  {
    title: "OWdle tests & previews",
    blurb: "Post-completion UI previews.",
    collapsible: true,
    tools: [
      {
        href: "/labeler/tier-preview/",
        label: "Tier preview",
        description: "All 7 rank badges + an editable 4/5 composite tier calculator.",
      },
      {
        href: "/labeler/streak-rank-preview/",
        label: "Streak rank preview",
        description:
          "Top 500 / Champion / Grandmaster badges, header pill, promotion modal, share card.",
      },
      {
        href: "/labeler/share-preview/",
        label: "Share card preview",
        description:
          "Round + Quote 1080² share cards + the hero costume-palette eyedropper.",
        helper: "localhost:8791",
      },
    ],
  },
  {
    title: "Deadlockle tests & previews",
    blurb: "Drive each mode into a state + card/rank previews — runs on :3001.",
    collapsible: true,
    tools: [
      { href: "/labeler/test/home/", label: "Home", site: "deadlockle", description: "Daily-complete hero, badges, mode-grid tags." },
      { href: "/labeler/test/classic/", label: "Classic", site: "deadlockle", description: "Attribute match. 10-guess cap, hints at 4/7." },
      { href: "/labeler/test/ability/", label: "Ability", site: "deadlockle", description: "Ability-icon reveal grid. 12-guess cap." },
      { href: "/labeler/test/mugshot/", label: "Mugshot", site: "deadlockle", description: "Cropped portrait, zoom pulls back. 5-guess cap." },
      { href: "/labeler/test/sound/", label: "Conversation", site: "deadlockle", description: "Two speakers; audio at 4/7. 8-guess cap." },
      { href: "/labeler/test/item/", label: "Item", site: "deadlockle", description: "Blurred item icon. 8-guess cap." },
      { href: "/labeler/share-preview/", label: "Card matrix", site: "deadlockle", description: "Every OG card variant in one grid (workers-og)." },
      { href: "/labeler/streak-rank-preview/", label: "Streak rank", site: "deadlockle", description: "Force Eternus / Ascendant / Phantom tier + streak." },
    ],
  },
  {
    title: "Play — OWdle",
    blurb: "Live modes (:3000).",
    tools: [
      { href: "/", label: "Home", description: "Daily-progress dashboard." },
      { href: "/classic/", label: "Classic", description: "Hero attribute Wordle." },
      { href: "/quote/", label: "Quote", description: "Identify both speakers." },
      { href: "/ability/", label: "Ability", description: "Reveal-the-ability puzzle." },
      { href: "/splash/", label: "Spotlight", description: "Sliver of splash art." },
      { href: "/sound/", label: "Sound", description: "Voice line / SFX puzzle." },
      { href: "/map/", label: "Map", description: "Overwatch GeoGuessr (WIP)." },
    ],
  },
  {
    title: "Play — Deadlockle",
    blurb: "Live modes (:3001).",
    tools: [
      { href: "/", label: "Home", site: "deadlockle", description: "Daily-progress dashboard." },
      { href: "/classic/", label: "Classic", site: "deadlockle", description: "Attribute Wordle." },
      { href: "/ability/", label: "Ability", site: "deadlockle", description: "Ability-icon puzzle." },
      { href: "/mugshot/", label: "Mugshot", site: "deadlockle", description: "Cropped portrait." },
      { href: "/sound/", label: "Conversation", site: "deadlockle", description: "Two-speaker dialogue." },
      { href: "/item/", label: "Item", site: "deadlockle", description: "Blurred item icon." },
    ],
  },
];

function toolUrl(t: Tool): string {
  return (t.site === "deadlockle" ? DL : "") + t.href;
}

function ToolCards({ tools }: { tools: Tool[] }) {
  return (
    <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {tools.map((t) => (
        <li key={t.label + t.href}>
          <a
            href={toolUrl(t)}
            className="block h-full rounded-(--radius-card) border border-line bg-inset/40 p-4 transition-colors hover:border-accent hover:bg-inset/70"
          >
            <div className="flex items-baseline justify-between gap-2">
              <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-accent">
                {t.label}
              </p>
              {t.site === "deadlockle" ? (
                <span className="shrink-0 rounded-full bg-info/15 px-1.5 py-0.5 font-mono text-[8px] uppercase tracking-[0.16em] text-info">
                  DL ↗
                </span>
              ) : (
                <span aria-hidden className="font-mono text-[10px] text-ink-faint">
                  →
                </span>
              )}
            </div>
            <p className="mt-2 font-mono text-[10px] leading-relaxed tracking-[0.12em] text-ink-soft">
              {t.description}
            </p>
            <div className="mt-3 flex items-baseline justify-between gap-2">
              <p className="truncate font-mono text-[9px] uppercase tracking-[0.16em] text-ink-faint/70">
                {toolUrl(t)}
              </p>
              {t.helper && (
                <p className="shrink-0 font-mono text-[9px] uppercase tracking-[0.16em] text-info/70">
                  helper: {t.helper}
                </p>
              )}
            </div>
          </a>
        </li>
      ))}
    </ul>
  );
}

export default function DevHub() {
  if (!IS_DEV) notFound();
  return (
    <main className="flex-1 bg-bg text-ink">
      <div className="mx-auto max-w-[1200px] px-4 py-8 sm:px-6 sm:py-10 lg:px-8">
        <header className="mb-8">
          <p className="font-mono text-[10px] uppercase tracking-[0.24em] text-info">
            DailyDles Dev
          </p>
          <h1 className="mt-1 font-display text-4xl text-ink sm:text-5xl">
            Unified dev hub
          </h1>
          <p className="mt-2 font-mono text-[10px] uppercase tracking-[0.2em] text-ink-faint">
            every tool, both sites · OWdle :3000 · Deadlockle :3001 · localhost only
          </p>
        </header>

        <div className="flex flex-col gap-10">
          {GROUPS.map((group) =>
            group.collapsible ? (
              <details key={group.title} className="group">
                <summary className="mb-3 flex cursor-pointer list-none items-baseline justify-between gap-3 border-b border-line pb-2">
                  <span className="flex items-baseline gap-2">
                    <span className="font-mono text-[11px] text-ink-faint transition-transform group-open:rotate-90">
                      ▸
                    </span>
                    <h2 className="font-display text-2xl text-ink">
                      {group.title}
                    </h2>
                  </span>
                  <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-faint">
                    {group.tools.length} tools
                  </span>
                </summary>
                <p className="mb-4 font-mono text-[10px] uppercase tracking-[0.18em] text-ink-soft">
                  {group.blurb}
                </p>
                <ToolCards tools={group.tools} />
              </details>
            ) : (
              <section key={group.title}>
                <div className="mb-3 flex items-baseline justify-between gap-3 border-b border-line pb-2">
                  <h2 className="font-display text-2xl text-ink">
                    {group.title}
                  </h2>
                  <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-faint">
                    {group.tools.length} tool{group.tools.length === 1 ? "" : "s"}
                  </span>
                </div>
                <p className="mb-4 font-mono text-[10px] uppercase tracking-[0.18em] text-ink-soft">
                  {group.blurb}
                </p>
                <ToolCards tools={group.tools} />
              </section>
            ),
          )}
        </div>

        <footer className="mt-12 border-t border-line pt-4 font-mono text-[9px] uppercase leading-relaxed tracking-[0.18em] text-ink-faint">
          DL ↗ tools open the Deadlockle dev app on :3001 — keep both stacks
          running (`npm run dev` in each repo).
        </footer>
      </div>
    </main>
  );
}
