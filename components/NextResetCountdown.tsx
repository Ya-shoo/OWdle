"use client";

import { useEffect, useState } from "react";

const RESET_HOUR_PT = 2;
const RESET_MIN_PT = 15;
const RESET_TZ = "America/Los_Angeles";

// Reads the IANA offset of Pacific time from UTC at the given instant.
// Returns minutes east of UTC (so PST returns -480, PDT returns -420).
function pacificOffsetMinutes(d: Date): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: RESET_TZ,
    timeZoneName: "shortOffset",
  }).formatToParts(d);
  const tz = parts.find((p) => p.type === "timeZoneName")?.value ?? "GMT-8";
  const m = tz.match(/GMT([+-])(\d+)(?::(\d+))?/);
  if (!m) return -8 * 60;
  const sign = m[1] === "-" ? -1 : 1;
  const hours = parseInt(m[2], 10);
  const minutes = m[3] ? parseInt(m[3], 10) : 0;
  return sign * (hours * 60 + minutes);
}

// Milliseconds until the next 2:15am Pacific Time — the moment all daily
// puzzles rotate to the next day's seed. DST-aware: the actual UTC moment
// shifts between 10:15 UTC (PST winter) and 09:15 UTC (PDT summer). On the
// two DST transition days per year the wall-clock 02:15 is ambiguous (or
// skipped), and the countdown can be off by up to one hour on that day —
// once a year, in the dead of night, acceptable.
function msUntilNextPacificReset(): number {
  const now = new Date();
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: RESET_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const get = (type: string) =>
    parseInt(parts.find((p) => p.type === type)?.value ?? "0", 10);
  const py = get("year");
  const pm = get("month");
  const pd = get("day");
  const ph = get("hour");
  const pmin = get("minute");

  const beforeResetToday =
    ph < RESET_HOUR_PT || (ph === RESET_HOUR_PT && pmin < RESET_MIN_PT);

  let ty = py;
  let tm = pm;
  let td = pd;
  if (!beforeResetToday) {
    const tomorrow = new Date(Date.UTC(py, pm - 1, pd + 1));
    ty = tomorrow.getUTCFullYear();
    tm = tomorrow.getUTCMonth() + 1;
    td = tomorrow.getUTCDate();
  }

  // Sample the Pacific offset at noon UTC on the target Pacific day — far
  // enough from the DST transition window to be unambiguous.
  const sample = new Date(Date.UTC(ty, tm - 1, td, 12, 0, 0));
  const offsetMin = pacificOffsetMinutes(sample);

  // Wall-clock 02:15 in Pacific = UTC ms for 02:15 minus the Pacific offset.
  const targetUtcMs =
    Date.UTC(ty, tm - 1, td, RESET_HOUR_PT, RESET_MIN_PT, 0) -
    offsetMin * 60 * 1000;

  return targetUtcMs - now.getTime();
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
