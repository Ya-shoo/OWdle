"use client";

import { useEffect, useState } from "react";

// Milliseconds until the next UTC midnight — the moment all daily puzzles
// rotate to the next day's seed.
function msUntilNextUtcMidnight(): number {
  const now = new Date();
  const tomorrow = Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate() + 1,
    0,
    0,
    0,
    0,
  );
  return tomorrow - now.getTime();
}

function formatHMS(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(h)}:${pad(m)}:${pad(s)}`;
}

export function NextResetCountdown({
  label = "Refresh in ",
  className,
}: {
  label?: string;
  className?: string;
}) {
  const [ms, setMs] = useState<number | null>(null);

  useEffect(() => {
    const tick = () => setMs(msUntilNextUtcMidnight());
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  return (
    <span suppressHydrationWarning className={className}>
      <span className="text-ink-faint">{label}</span>
      <span className="font-semibold tabular-nums text-accent-soft">
        {ms == null ? "—" : formatHMS(ms)}
      </span>
    </span>
  );
}
