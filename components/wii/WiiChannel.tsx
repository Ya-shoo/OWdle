"use client";

import Link from "next/link";
import clsx from "clsx";
import type { ModeDef } from "@/lib/modes";

type Status = { won: boolean; guesses: number } | undefined;

// One Wii Channel tile in the home grid. Built modes are <Link>s
// (whole tile is the click target, just like a real Wii channel);
// unbuilt modes render as a non-interactive div with a "soon" stamp.
export function WiiChannel({
  mode,
  status,
  number,
  href,
  bobDelay,
}: {
  mode: ModeDef;
  status: Status;
  number: number;
  href: string | null;
  bobDelay: number;
}) {
  const inner = (
    <ChannelInner mode={mode} status={status} number={number} />
  );

  if (!mode.built || !href) {
    return (
      <div className="wii-channel is-soon" aria-disabled>
        {inner}
      </div>
    );
  }

  return (
    <Link
      href={href}
      className={clsx("wii-channel wii-channel-bob")}
      style={{ animationDelay: `${bobDelay}s` }}
      aria-label={`Open ${mode.label} channel`}
    >
      {inner}
    </Link>
  );
}

function ChannelInner({
  mode,
  status,
  number,
}: {
  mode: ModeDef;
  status: Status;
  number: number;
}) {
  return (
    <>
      {/* status corner */}
      <div className="relative flex items-start justify-between">
        <div
          className="wii-mono-tab text-[10px] font-bold uppercase tracking-[0.22em]"
          style={{ color: "var(--wii-blue)" }}
        >
          Ch.{String(number).padStart(2, "0")}
        </div>
        <ChannelStatusPip mode={mode} status={status} />
      </div>

      {/* big icon glyph */}
      <div className="relative grid flex-1 place-items-center py-3">
        <ChannelGlyph slug={mode.slug} />
      </div>

      {/* bottom label block */}
      <div className="relative">
        <h3
          className="wii-display text-2xl sm:text-[26px]"
          style={{ color: "var(--wii-ink)" }}
        >
          {mode.label}
        </h3>
        <p
          className="mt-1 text-[12.5px] leading-snug"
          style={{ color: "var(--wii-ink-soft)" }}
        >
          {mode.blurb}
        </p>
      </div>
    </>
  );
}

function ChannelStatusPip({
  mode,
  status,
}: {
  mode: ModeDef;
  status: Status;
}) {
  if (!mode.built) {
    return (
      <span
        className="rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.2em]"
        style={{
          background: "rgba(108, 200, 255, 0.12)",
          color: "var(--wii-blue)",
        }}
      >
        Soon
      </span>
    );
  }
  if (status?.won) {
    return (
      <span
        className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-bold"
        style={{
          background:
            "linear-gradient(180deg, #a3e8a8 0%, var(--wii-green) 100%)",
          color: "var(--wii-green-on)",
          boxShadow:
            "inset 0 1px 0 rgba(255,255,255,0.35), 0 2px 6px -2px rgba(0,0,0,0.5)",
        }}
      >
        <span aria-hidden>✓</span>
        {status.guesses}
      </span>
    );
  }
  if (status && status.guesses > 0) {
    return (
      <span
        className="rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.18em]"
        style={{
          background: "rgba(255, 212, 84, 0.15)",
          color: "var(--wii-yellow)",
        }}
      >
        {status.guesses} in
      </span>
    );
  }
  return (
    <span
      className="rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.2em]"
      style={{
        background: "rgba(108, 200, 255, 0.18)",
        color: "var(--wii-blue)",
      }}
    >
      Play
    </span>
  );
}

// Per-mode glyph in a soft cyan disc. SVG so it scales cleanly and we
// can tint with currentColor. Visual language: bold, rounded, low-detail
// — matches the simple symbology Wii Channels used.
function ChannelGlyph({ slug }: { slug: string }) {
  return (
    <div
      className="relative grid h-[110px] w-[110px] place-items-center rounded-full sm:h-[120px] sm:w-[120px]"
      style={{
        background:
          "radial-gradient(circle at 50% 35%, rgba(108,200,255,0.35) 0%, rgba(108,200,255,0.05) 60%, transparent 100%)",
      }}
      aria-hidden
    >
      <div
        className="relative grid h-[78px] w-[78px] place-items-center rounded-full sm:h-[88px] sm:w-[88px]"
        style={{
          background:
            "linear-gradient(180deg, #2c4078 0%, #16264a 100%)",
          boxShadow:
            "inset 0 1px 0 rgba(255,255,255,0.2), inset 0 -2px 0 rgba(0,0,0,0.3), 0 6px 14px -6px rgba(0,0,0,0.6)",
        }}
      >
        <svg
          viewBox="0 0 64 64"
          width="44"
          height="44"
          style={{ color: "var(--wii-blue)" }}
        >
          {GLYPHS[slug] ?? GLYPHS.classic}
        </svg>
      </div>
    </div>
  );
}

// Friendly low-detail glyphs. Designed to read at 44px and below.
const GLYPHS: Record<string, React.ReactNode> = {
  classic: (
    <g fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
      <rect x="10" y="10" width="18" height="18" rx="3" fill="currentColor" fillOpacity="0.18" />
      <rect x="36" y="10" width="18" height="18" rx="3" />
      <rect x="10" y="36" width="18" height="18" rx="3" />
      <rect x="36" y="36" width="18" height="18" rx="3" fill="currentColor" fillOpacity="0.18" />
    </g>
  ),
  quote: (
    <g fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 18 C14 13, 18 10, 24 10 L40 10 C46 10, 50 13, 50 18 L50 30 C50 35, 46 38, 40 38 L26 38 L18 46 L18 38 C15 37, 14 33, 14 30 Z" fill="currentColor" fillOpacity="0.18" />
      <circle cx="24" cy="24" r="2" fill="currentColor" />
      <circle cx="32" cy="24" r="2" fill="currentColor" />
      <circle cx="40" cy="24" r="2" fill="currentColor" />
    </g>
  ),
  ability: (
    <g fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="32" cy="32" r="20" fill="currentColor" fillOpacity="0.15" />
      <path d="M32 14 L32 32 L46 38" />
      <circle cx="32" cy="32" r="3" fill="currentColor" />
    </g>
  ),
  splash: (
    <g fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
      <rect x="8" y="14" width="48" height="36" rx="4" fill="currentColor" fillOpacity="0.15" />
      <circle cx="22" cy="28" r="4" fill="currentColor" />
      <path d="M14 46 L26 34 L34 42 L42 30 L52 42" />
    </g>
  ),
  sound: (
    <g fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 24 L30 24 L40 14 L40 50 L30 40 L22 40 Z" fill="currentColor" fillOpacity="0.18" />
      <path d="M46 22 C50 26, 50 38, 46 42" />
      <path d="M52 16 C58 22, 58 42, 52 48" />
    </g>
  ),
  map: (
    <g fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="32" cy="28" r="10" fill="currentColor" fillOpacity="0.18" />
      <circle cx="32" cy="28" r="3" fill="currentColor" />
      <path d="M32 38 L32 54" />
    </g>
  ),
};
