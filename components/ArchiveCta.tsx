"use client";

import Link from "next/link";

// Prominent, self-contained entry point to the past-week Archive. Replaces
// the quiet mono text-links that used to sit under the home grid and in the
// Classic header — those read as afterthoughts, so the archive (a core
// retention hook: replay a missed day, redeem a red day to green) went
// unnoticed.
//
// SOLID surfaces only: a fully-opaque `bg-card` body (same panel token as the
// home mode cards) with a solid accent chip — NO translucent/low-opacity
// washes (no `bg-accent/10`). See globals.css's --bg-card note and the
// AGENTS.md "solid surfaces" convention. No border/outline: the button reads
// off its solid fill, shadow, and hover motion (lift + icon spin + arrow).
//
// `subline` overrides the default caption; `className` lets each host set its
// own alignment + margins (centered under the home grid, right-aligned in the
// Classic header, …).
export function ArchiveCta({
  subline = "Replay past days",
  className = "",
}: {
  subline?: string;
  className?: string;
}) {
  return (
    <Link
      href="/archive/"
      aria-label="Open the archive to replay past days"
      className={
        "group inline-flex items-center gap-3 rounded-(--radius-card) bg-card px-4 py-3 shadow-card transition-[transform,box-shadow] duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] hover:-translate-y-0.5 hover:shadow-card-hover active:translate-y-0 " +
        className
      }
    >
      <span
        aria-hidden
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent text-on-accent transition-transform duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] group-hover:-rotate-[160deg]"
      >
        ↺
      </span>
      <span className="flex flex-col text-left">
        <span className="font-display text-base font-bold uppercase leading-none tracking-wide text-ink">
          Archive
        </span>
        <span className="utility-label mt-1 text-[10px] text-ink-faint">
          {subline}
        </span>
      </span>
      <span
        aria-hidden
        className="ml-1 shrink-0 font-display text-lg text-accent transition-transform duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] group-hover:translate-x-0.5"
      >
        →
      </span>
    </Link>
  );
}
