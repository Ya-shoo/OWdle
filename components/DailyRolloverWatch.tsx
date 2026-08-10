"use client";

import { useEffect, useState } from "react";
import { dayString, msUntilNextPacificReset } from "@/lib/daily";

// Handles the puzzle day rolling over (2:15am Pacific) while a tab stays open.
//
// The games freeze their `day` at mount and never re-check it, while the
// progress indicators (HeaderProgress / NextModeCTA) read the LIVE day. So
// once the day rolls, a mode solved "before" the roll sits under the previous
// day's storage key and the progress dots — correctly, but silently — show it
// as unfinished for the new day. That silent reset is what a player reads as
// "it says I didn't finish modes I clearly finished," and it lands in the
// middle of the day for non-Pacific players (2:15am PT ≈ 11am Berlin, 7pm
// Tokyo, 9pm Sydney).
//
// The reset moment is otherwise unhandled: NextResetCountdown ticks to zero
// and does nothing. This global watcher wakes at the roll and brings the app
// to the new day:
//   - tab hidden/backgrounded  -> reload silently, so a returning player just
//     lands on today's puzzles with no interstitial.
//   - tab visible/active       -> a solid banner offers a one-tap refresh, so
//     we never yank someone out of a guess in progress.
export function DailyRolloverWatch() {
  const [rolled, setRolled] = useState(false);

  useEffect(() => {
    // The day this tab believes it is on. Any later value is a rollover.
    const bootDay = dayString();
    let timer: ReturnType<typeof setTimeout> | undefined;
    let done = false; // set once we've reloaded or shown the banner

    const resolve = () => {
      if (done) return;
      // Backgrounded at the roll: upgrade silently. Active: surface the
      // banner and let the player choose when to jump.
      if (document.visibilityState === "hidden") {
        done = true;
        window.location.reload();
      } else {
        done = true;
        setRolled(true);
      }
    };

    const check = () => {
      if (done) return;
      if (dayString() !== bootDay) {
        resolve();
        return;
      }
      schedule();
    };

    const schedule = () => {
      if (done) return;
      // Sleep until just past the computed reset instant. Clamp so clock skew
      // (a negative estimate) or a bad read can't leave us asleep forever or
      // busy-loop; a laptop that slept through the roll is caught by the
      // focus / visibility re-check below regardless.
      const ms = msUntilNextPacificReset();
      const wait = Math.min(Math.max(ms + 1500, 1000), 60 * 60 * 1000);
      timer = setTimeout(check, wait);
    };

    schedule();

    const onWake = () => {
      // Returning to a tab that rolled while hidden: silently reload if still
      // hidden (rare), otherwise show the banner. Also lets a slept-through
      // roll get caught even if the background timer was throttled away.
      if (dayString() !== bootDay) resolve();
    };
    const onHide = () => {
      // Player saw the banner, ignored it, then tabbed away — upgrade them in
      // the background so they return to today's puzzles.
      if (rolled && document.visibilityState === "hidden") {
        window.location.reload();
      }
    };

    document.addEventListener("visibilitychange", onWake);
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("focus", onWake);
    return () => {
      if (timer !== undefined) clearTimeout(timer);
      document.removeEventListener("visibilitychange", onWake);
      document.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("focus", onWake);
    };
  }, [rolled]);

  if (!rolled) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed inset-x-0 bottom-4 z-50 flex justify-center px-4"
    >
      <div className="flex w-full max-w-sm items-center gap-3 rounded-(--radius-card) border border-line bg-card p-3 shadow-[0_8px_28px_-6px_rgba(0,0,0,0.6)]">
        <span
          aria-hidden
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent text-on-accent"
        >
          <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor">
            <path d="M12 2l2.6 6.9L22 9.3l-5.4 4.6 1.8 7.1L12 17.3 5.6 21l1.8-7.1L2 9.3l7.4-.4z" />
          </svg>
        </span>
        <div className="flex min-w-0 flex-1 flex-col">
          <span className="font-display text-sm font-bold uppercase tracking-wide text-ink">
            New daily puzzles are live
          </span>
          <span className="text-xs text-ink-soft">
            Your progress reset for the new day.
          </span>
        </div>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="shrink-0 rounded-full bg-accent px-4 py-2 font-display text-sm font-bold uppercase tracking-wide text-on-accent transition-transform active:scale-[0.98]"
        >
          Play today&rsquo;s
        </button>
      </div>
    </div>
  );
}
