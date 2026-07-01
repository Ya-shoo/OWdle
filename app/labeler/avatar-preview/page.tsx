"use client";

// Dev-only preview for the home-page avatar greeter. Renders the real
// <AvatarGreeter> in a faux page corner so you can watch the pop-in +
// one-shot wave + announcement bubble, and replay it. The production
// component remembers bubble dismissals in localStorage; here we vary the
// announcement id per replay so it always re-shows.

import { useState } from "react";
import { AvatarGreeter } from "@/components/AvatarGreeter";

// Sample message for the preview. In production the real text comes from
// Discord via /api/greeter (see components/SiteGreeter.tsx); here we just
// exercise the component with a stand-in and vary the id per replay so the
// bubble always re-shows despite the seen-tracking.
const SAMPLE = {
  id: "preview-sample",
  title: "Help pick what's next 🗳️",
  body: "Which mode should we build next?",
  // Stable poll id (decoupled from the per-replay announcement id below) so a
  // vote + its live percentages persist across "Replay pop-in" instead of
  // starting a fresh poll every time. Real Discord polls omit this and fall
  // back to announcement.id (the message id).
  poll: {
    id: "preview-poll",
    options: [
      { value: "geo", label: "Overwatch GeoGuessr" },
      { value: "unlimited", label: "Unlimited mode" },
    ],
  },
};

export default function AvatarPreviewPage() {
  const [nonce, setNonce] = useState(0);
  const [withBubble, setWithBubble] = useState(true);

  const announcement = withBubble
    ? { ...SAMPLE, id: `${SAMPLE.id}:${nonce}` }
    : null;

  return (
    <main className="mx-auto max-w-4xl px-6 py-10">
      <header>
        <p className="font-mono text-[10px] uppercase tracking-[0.24em] text-info">
          OWdle Dev · site chrome
        </p>
        <h1 className="mt-1 font-display text-3xl font-bold tracking-tight text-ink sm:text-4xl">
          Avatar greeter
        </h1>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-ink-soft">
          The mascot pops into the top-right corner on load and plays its wave
          once, with the latest announcement (edit{" "}
          <code className="font-mono text-xs text-ink">lib/greeter.ts</code>)
          beside it. A few seconds after the wave, the whole mascot tucks away
          into a small speech bubble — hover or tap it to replay the whole
          thing.
        </p>
      </header>

      <div className="mt-7 flex flex-wrap items-center gap-x-6 gap-y-3 rounded-(--radius-card) border border-line bg-inset/40 px-5 py-4">
        <button
          onClick={() => setNonce((n) => n + 1)}
          className="rounded-full bg-ink px-4 py-2 font-mono text-[11px] uppercase tracking-[0.18em] text-canvas transition-transform hover:scale-[1.03] active:scale-[0.97]"
        >
          ▸ Replay pop-in
        </button>
        <label className="flex cursor-pointer items-center gap-2 font-mono text-[11px] uppercase tracking-[0.16em] text-ink-soft">
          <input
            type="checkbox"
            checked={withBubble}
            onChange={(e) => setWithBubble(e.target.checked)}
            className="h-4 w-4 accent-[var(--color-accent,#f26522)]"
          />
          Speech bubble
        </label>
        <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-ink-faint">
          mascot tucks into a bubble after the wave · hover or tap to replay
        </p>
      </div>

      {/* faux home-page corner so the greeter lands where it will in prod */}
      <div className="relative mt-6 h-[26rem] overflow-hidden rounded-(--radius-card) border border-line bg-bg">
        <div className="absolute left-5 top-5 flex items-center gap-2 opacity-60">
          <div className="h-6 w-6 rounded-md bg-ink/15" />
          <div className="h-3 w-24 rounded-full bg-ink/10" />
        </div>
        <div className="absolute left-5 top-16 h-3 w-40 rounded-full bg-ink/10 opacity-50" />
        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 font-mono text-[10px] uppercase tracking-[0.2em] text-ink-faint/60">
          (home page)
        </div>

        {/* key remounts the greeter so "Replay pop-in" restarts the entrance */}
        <div className="absolute right-5 top-5">
          {/* apiBase points the sample poll at the local Pages-functions dev
              server (:8799) so votes record + live percentages render. This
              page is dev-only (layout notFound in prod), so the hardcoded
              localhost URL never ships. */}
          <AvatarGreeter
            key={nonce}
            announcement={announcement}
            apiBase="http://localhost:8799"
          />
        </div>
      </div>

      <p className="mt-4 max-w-2xl font-mono text-[10px] uppercase leading-relaxed tracking-[0.12em] text-ink-faint">
        asset · public/greeter/wave.mp4 + .webm + poster (one-shot, ~5s, no
        audio) · regenerate via scripts/build-greeter-video.sh &lt;source&gt;.
        note · the clip carries the avatar&apos;s own baked-in &quot;...&quot;
        bubble in its top-right; the announcement bubble opens below-left so the
        two don&apos;t overlap.
      </p>
    </main>
  );
}
