"use client";

// Homepage "OWdle has been played N times so far!" badge. The number is the
// all-time completed-round super-total (from /api/stats/lifetime).
//
// It FEELS live without hammering anything: on load it rolls up to the total
// (a quick odometer spin), then JUMPS forward in chunky steps every few
// seconds at the server-supplied current pace, and quietly re-syncs to the
// real cached total every 45s (forward-only, so it never counts down).
// PostHog is only hit ~once/min behind the cache. See
// functions/api/stats/lifetime.ts for the cost model.

import { useEffect, useRef, useState } from "react";
import { Plate } from "./Plate";

type Lifetime = { total: number; ratePerSec: number };

const ROLL_MS = 1800; // load roll-up duration (smooth spin)
const ROLL_FROM = 2000; // how far below the total the roll-up starts
const JUMP_MS = 3500; // live phase updates in chunky jumps, not every frame
const SYNC_MS = 45_000;
const DIGIT_MS = 450; // per-digit roll duration
const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);

// Pages Functions don't run under `next dev`, so the real endpoint 404s
// locally. This mock lets the badge render in dev; the rate is tuned so the
// preview shows the same chunky "jump a couple every few seconds" cadence the
// live counter has during active hours. Dead-code-eliminated from prod.
const DEV_MOCK: Lifetime | null =
  process.env.NODE_ENV !== "production"
    ? { total: 98201, ratePerSec: 0.6 }
    : null;

export function LifetimeCounter() {
  const [value, setValue] = useState<number | null>(null);
  // Desktop-only flag. The homepage also wraps this in `hidden sm:block`, but
  // gating the whole component on a matchMedia check means it never mounts,
  // fetches /api/stats/lifetime, or runs the odometer on phones — where this
  // social-proof card would just be clutter. SSR + first paint render null
  // (isDesktop=false) so there's no hydration mismatch, then it flips on for
  // desktop after mount. Breakpoint matches Tailwind's `sm` (640px).
  const [isDesktop, setIsDesktop] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const mq = window.matchMedia("(min-width: 640px)");
    const update = () => setIsDesktop(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);
  const base = useRef(0); // count at anchorAt
  const rate = useRef(0); // rounds per second
  const anchorAt = useRef(0); // ms — when `base` was accurate
  const roll = useRef<{ from: number; to: number; at: number } | null>(null);
  const running = useRef(false);

  useEffect(() => {
    if (!isDesktop) return; // mobile never mounts the counter — no fetch, no animation
    let stopped = false;
    let raf = 0;
    let jumpId: ReturnType<typeof setInterval> | undefined;

    const live = (now: number) =>
      base.current + rate.current * Math.max(0, (now - anchorAt.current) / 1000);

    const apply = (d: Lifetime, first: boolean) => {
      const now = Date.now();
      if (first) {
        roll.current = { from: Math.max(0, d.total - ROLL_FROM), to: d.total, at: now };
        base.current = d.total;
        rate.current = d.ratePerSec;
        anchorAt.current = now + ROLL_MS; // live phase begins where the roll ends
      } else {
        // Forward-only: a sync can only pull the number up, never back.
        base.current = Math.max(d.total, Math.floor(live(now)));
        rate.current = d.ratePerSec;
        anchorAt.current = now;
      }
    };

    // Smooth spin for the one-time load roll-up only.
    const rollTick = () => {
      if (stopped) return;
      const now = Date.now();
      if (roll.current && now < roll.current.at + ROLL_MS) {
        const t = easeOut((now - roll.current.at) / ROLL_MS);
        setValue(
          Math.round(roll.current.from + (roll.current.to - roll.current.from) * t),
        );
        raf = requestAnimationFrame(rollTick);
      } else {
        roll.current = null;
        setValue(Math.floor(live(now)));
      }
    };

    // Live phase: sample the running estimate on a slow interval so the number
    // jumps a few at a time instead of flickering every frame.
    const jump = () => {
      if (stopped || roll.current) return;
      setValue(Math.floor(live(Date.now())));
    };

    const start = (d: Lifetime) => {
      apply(d, true);
      if (running.current) return;
      running.current = true;
      raf = requestAnimationFrame(rollTick);
      jumpId = setInterval(jump, JUMP_MS);
    };

    if (DEV_MOCK) {
      start(DEV_MOCK);
      return () => {
        stopped = true;
        cancelAnimationFrame(raf);
        if (jumpId) clearInterval(jumpId);
      };
    }

    const sync = async (first: boolean) => {
      try {
        const res = await fetch("/api/stats/lifetime");
        if (!res.ok || stopped) return;
        const d = (await res.json()) as Lifetime;
        if (typeof d.total !== "number" || d.total <= 0) return;
        if (first) start(d);
        else apply(d, false);
      } catch {
        // First fetch failing leaves the badge hidden; a later sync recovers.
      }
    };

    sync(true);
    const syncId = setInterval(() => sync(false), SYNC_MS);
    return () => {
      stopped = true;
      cancelAnimationFrame(raf);
      if (jumpId) clearInterval(jumpId);
      clearInterval(syncId);
    };
  }, [isDesktop]);

  if (!isDesktop || value === null) return null; // desktop-only; no flash before the first real number

  return (
    <Plate tone="gold" size="xl">
      <span className="inline-flex items-center whitespace-nowrap font-extrabold tracking-[0.05em]">
        OWdle has been played&nbsp;
        <Odometer value={value} />
        &nbsp;times so far! (ᵔ◡ᵔ)
      </span>
    </Plate>
  );
}

// Lightweight odometer: each digit is a fixed-width window over a stacked
// 0-9 strip; changing the digit slides the strip, rolling through the values.
function Odometer({ value }: { value: number }) {
  const chars = value.toLocaleString("en-US").split("");
  return (
    <span className="inline-block whitespace-nowrap tabular-nums tracking-normal">
      {chars.map((ch, i) =>
        ch === "," ? (
          <span key={`c${i}`} className="px-[0.02em]">
            ,
          </span>
        ) : (
          <Digit key={`d${chars.length - i}`} d={Number(ch)} />
        ),
      )}
    </span>
  );
}

function Digit({ d }: { d: number }) {
  return (
    <span className="relative inline-block h-[1em] w-[0.56em] overflow-hidden align-[-0.16em]">
      <span
        className="absolute inset-x-0 top-0 flex flex-col"
        style={{
          transform: `translateY(${-d * 10}%)`,
          transition: `transform ${DIGIT_MS}ms cubic-bezier(0.22,1,0.36,1)`,
        }}
      >
        {Array.from({ length: 10 }, (_, n) => (
          <span key={n} className="flex h-[1em] items-center justify-center leading-none">
            {n}
          </span>
        ))}
      </span>
    </span>
  );
}
