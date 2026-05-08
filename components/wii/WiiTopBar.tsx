"use client";

import { useEffect, useState } from "react";

// Status-bar strip across the top of the Wii dev shell: live clock and
// the OWdle wordmark in the rounded display face. Mirrors the way the
// Wii Channel menu shows the system clock in the corner.

function pad(n: number): string {
  return n.toString().padStart(2, "0");
}

function formatTime(d: Date): string {
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function formatDate(d: Date): string {
  // Wii system bar reads "Sat 5/2" — short, weekday + numeric date
  const wd = d.toLocaleDateString(undefined, { weekday: "short" });
  return `${wd} ${d.getMonth() + 1}/${d.getDate()}`;
}

export function WiiTopBar() {
  // null on first paint to avoid a hydration mismatch — the time the
  // server rendered with is almost guaranteed to differ from the client.
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    setNow(new Date());
    const id = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="flex items-center justify-between px-6 pt-6 pb-2 sm:px-10">
      <div className="flex items-center gap-3">
        <div
          aria-hidden
          className="grid h-9 w-9 place-items-center rounded-full"
          style={{
            background: "linear-gradient(180deg, #82d4ff 0%, var(--wii-blue) 60%, var(--wii-blue-deep) 100%)",
            boxShadow:
              "inset 0 1px 0 rgba(255,255,255,0.4), 0 4px 12px -4px var(--wii-blue-glow)",
          }}
        >
          <span
            className="wii-display text-base"
            style={{ color: "#07142a" }}
          >
            OW
          </span>
        </div>
        <div className="leading-tight">
          <div
            className="wii-display text-2xl"
            style={{ color: "var(--wii-ink)" }}
          >
            OWdle
          </div>
          <div
            className="text-[11px] font-semibold tracking-[0.18em] uppercase"
            style={{ color: "var(--wii-blue)" }}
          >
            Wii Channel · dev
          </div>
        </div>
      </div>

      <div
        className="hidden items-center gap-4 rounded-full px-4 py-2 sm:inline-flex"
        style={{
          background: "rgba(8, 18, 42, 0.55)",
          boxShadow:
            "inset 0 1px 0 rgba(255,255,255,0.06), inset 0 0 0 1px var(--wii-surface-edge)",
        }}
      >
        <div
          className="wii-mono-tab text-sm"
          style={{ color: "var(--wii-ink)" }}
          suppressHydrationWarning
        >
          {now ? formatTime(now) : "--:--"}
        </div>
        <div
          className="h-3 w-px"
          style={{ background: "var(--wii-surface-edge)" }}
          aria-hidden
        />
        <div
          className="text-sm font-semibold"
          style={{ color: "var(--wii-ink-soft)" }}
          suppressHydrationWarning
        >
          {now ? formatDate(now) : "—"}
        </div>
      </div>
    </div>
  );
}
