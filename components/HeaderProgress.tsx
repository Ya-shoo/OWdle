"use client";

import { useEffect, useState } from "react";
import { dayString } from "@/lib/daily";
import { loadModeState } from "@/lib/storage";
import { BUILT_MODE_SLUGS } from "@/lib/modes";

// Tiny daily-progress indicator on the right side of the header.
// One dot per built mode: filled when that mode has been won today.
export function HeaderProgress() {
  const [statuses, setStatuses] = useState<boolean[] | null>(null);

  useEffect(() => {
    const day = dayString();
    setStatuses(BUILT_MODE_SLUGS.map((slug) => loadModeState(slug, day).won));
  }, []);

  if (!statuses) {
    return (
      <div
        aria-hidden
        className="flex items-center gap-1.5 opacity-0"
        style={{ minWidth: BUILT_MODE_SLUGS.length * 14 }}
      />
    );
  }

  const wonCount = statuses.filter(Boolean).length;
  const total = statuses.length;

  return (
    <div
      className="flex items-center gap-2.5"
      title={`${wonCount} of ${total} modes complete today`}
      aria-label={`${wonCount} of ${total} modes complete today`}
    >
      <span className="hidden font-mono text-[10px] uppercase tracking-[0.2em] text-info sm:inline">
        {wonCount} / {total}
      </span>
      <div className="flex items-center gap-1.5">
        {statuses.map((won, i) => (
          <span
            key={i}
            className={
              won
                ? "h-1.5 w-1.5 rounded-full bg-correct"
                : "h-1.5 w-1.5 rounded-full bg-line"
            }
          />
        ))}
      </div>
    </div>
  );
}
