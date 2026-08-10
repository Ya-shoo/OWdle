"use client";

import { useEffect, useState } from "react";
import { msUntilNextPacificReset } from "@/lib/daily";

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
    const tick = () => setMs(msUntilNextPacificReset());
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  return (
    <span suppressHydrationWarning className={className}>
      <span className="text-ink-faint">{label}</span>
      <span className="tabular-nums text-accent-soft">
        {ms == null ? "—" : formatHMS(ms)}
      </span>
    </span>
  );
}
