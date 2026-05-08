"use client";

import { useEffect, useState } from "react";
import { motion } from "motion/react";
import { dayString, prettyDay } from "@/lib/daily";
import {
  BUILT_MODE_SLUGS,
  MODES,
  type ModeSlug,
} from "@/lib/modes";
import { loadModeState } from "@/lib/storage";
import { WiiChannel } from "./WiiChannel";
import { WiiTopBar } from "./WiiTopBar";

type Status = { won: boolean; guesses: number };
type StatusMap = Partial<Record<ModeSlug, Status>>;

export function WiiHome() {
  const [day, setDay] = useState<string | null>(null);
  const [statuses, setStatuses] = useState<StatusMap>({});

  useEffect(() => {
    const d = dayString();
    setDay(d);
    const map: StatusMap = {};
    for (const slug of BUILT_MODE_SLUGS) {
      const st = loadModeState(slug, d);
      map[slug] = { won: st.won, guesses: st.guesses.length };
    }
    setStatuses(map);
  }, []);

  const wonCount = BUILT_MODE_SLUGS.filter((s) => statuses[s]?.won).length;

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-6xl flex-col">
      <WiiTopBar />

      {/* Welcome card — sits between top bar and channel grid, like the
          Wii system message at the top of the menu. */}
      <section className="px-6 pt-6 sm:px-10">
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
          className="wii-card flex flex-col gap-5 px-7 py-8 sm:flex-row sm:items-center sm:justify-between sm:px-10 sm:py-9"
        >
          <div>
            <p className="wii-eyebrow">
              <span suppressHydrationWarning>
                {day ? prettyDay(day) : "Today"}
              </span>
              <span style={{ color: "var(--wii-ink-faint)" }}>
                {" · daily puzzle"}
              </span>
            </p>
            <h1
              className="wii-display mt-2 text-4xl sm:text-5xl"
              style={{ color: "var(--wii-ink)" }}
            >
              Welcome back.
            </h1>
            <p
              className="mt-2 max-w-md text-base"
              style={{ color: "var(--wii-ink-soft)" }}
            >
              Pick a channel to play today&apos;s puzzle. New puzzles arrive
              at midnight UTC.
            </p>
          </div>

          {/* Right side: progress dial */}
          <ProgressDial won={wonCount} total={BUILT_MODE_SLUGS.length} />
        </motion.div>
      </section>

      {/* Channel grid */}
      <section className="flex-1 px-6 py-10 sm:px-10 sm:py-14">
        <header className="mb-6 flex items-baseline justify-between">
          <h2
            className="text-[11px] font-bold uppercase tracking-[0.22em]"
            style={{ color: "var(--wii-blue)" }}
          >
            Channels
          </h2>
          <span
            className="text-xs"
            style={{ color: "var(--wii-ink-faint)" }}
          >
            {day
              ? `${wonCount} / ${BUILT_MODE_SLUGS.length} done today`
              : `${BUILT_MODE_SLUGS.length} live`}
          </span>
        </header>

        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 lg:gap-5">
          {MODES.map((mode, i) => {
            // Wii classic is the only built mode in the dev preview.
            // Others link to the production version so the dev grid is
            // still functional as a real launcher.
            const href = !mode.built
              ? null
              : mode.slug === "classic"
                ? "/dev/wii/classic/"
                : `/${mode.slug}/`;
            return (
              <motion.li
                key={mode.slug}
                initial={{ opacity: 0, y: 14, scale: 0.96 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                transition={{
                  duration: 0.5,
                  delay: 0.08 + i * 0.06,
                  ease: [0.22, 1, 0.36, 1],
                }}
              >
                <WiiChannel
                  mode={mode}
                  status={mode.built ? statuses[mode.slug] : undefined}
                  number={i + 1}
                  href={href}
                  bobDelay={(i % 3) * 0.6}
                />
              </motion.li>
            );
          })}
        </ul>
      </section>

      <footer
        className="px-6 pb-10 pt-2 text-center text-[12px] sm:px-10"
        style={{ color: "var(--wii-ink-faint)" }}
      >
        Wii dark-mode preview · only Channel 01 (Classic) renders in this
        skin so far. Other channels link out to the standard view.
      </footer>
    </main>
  );
}

function ProgressDial({ won, total }: { won: number; total: number }) {
  const SIZE = 110;
  const STROKE = 9;
  const RADIUS = (SIZE - STROKE) / 2;
  const C = 2 * Math.PI * RADIUS;
  const pct = total === 0 ? 0 : won / total;

  return (
    <div className="relative shrink-0" style={{ width: SIZE, height: SIZE }}>
      <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`}>
        <defs>
          <linearGradient id="wii-dial" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#82d4ff" />
            <stop offset="60%" stopColor="var(--wii-blue)" />
            <stop offset="100%" stopColor="var(--wii-blue-deep)" />
          </linearGradient>
          <filter id="wii-dial-glow" x="-30%" y="-30%" width="160%" height="160%">
            <feGaussianBlur stdDeviation="2.5" />
          </filter>
        </defs>
        {/* track */}
        <circle
          cx={SIZE / 2}
          cy={SIZE / 2}
          r={RADIUS}
          fill="none"
          stroke="var(--wii-surface-edge)"
          strokeWidth={STROKE}
          opacity={0.6}
        />
        {/* glow halo behind progress */}
        <motion.circle
          cx={SIZE / 2}
          cy={SIZE / 2}
          r={RADIUS}
          fill="none"
          stroke="url(#wii-dial)"
          strokeWidth={STROKE}
          strokeLinecap="round"
          strokeDasharray={C}
          initial={{ strokeDashoffset: C }}
          animate={{ strokeDashoffset: C * (1 - pct) }}
          transition={{ duration: 0.9, delay: 0.3, ease: [0.22, 1, 0.36, 1] }}
          transform={`rotate(-90 ${SIZE / 2} ${SIZE / 2})`}
          filter="url(#wii-dial-glow)"
        />
        {/* crisp progress on top */}
        <motion.circle
          cx={SIZE / 2}
          cy={SIZE / 2}
          r={RADIUS}
          fill="none"
          stroke="url(#wii-dial)"
          strokeWidth={STROKE}
          strokeLinecap="round"
          strokeDasharray={C}
          initial={{ strokeDashoffset: C }}
          animate={{ strokeDashoffset: C * (1 - pct) }}
          transition={{ duration: 0.9, delay: 0.3, ease: [0.22, 1, 0.36, 1] }}
          transform={`rotate(-90 ${SIZE / 2} ${SIZE / 2})`}
        />
      </svg>
      <div className="absolute inset-0 grid place-items-center text-center leading-none">
        <div>
          <div
            className="wii-display text-3xl"
            style={{ color: "var(--wii-ink)" }}
          >
            {won}
            <span style={{ color: "var(--wii-ink-faint)" }}>/{total}</span>
          </div>
          <div
            className="mt-1 text-[10px] font-bold uppercase tracking-[0.22em]"
            style={{ color: "var(--wii-blue)" }}
          >
            Today
          </div>
        </div>
      </div>
    </div>
  );
}
