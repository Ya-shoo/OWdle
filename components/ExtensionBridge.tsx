"use client";

// Publishes a compact streak / last-played snapshot to localStorage for the
// "OWdle Daily Reminder" browser extension to read. The extension injects a
// content script on this origin that relays localStorage["owdle.reminder"] to
// its background worker (Firefox and Safari have no externally_connectable,
// so a plain localStorage handoff is the one mechanism that works in every
// browser). If no extension is installed, this is just an unread key.
//
// One-way: the site never reads anything back. We only write when the
// snapshot actually changes, so there's no storage churn.

import { useEffect } from "react";
import { dayString } from "@/lib/daily";
import { bumpStreakIfNeeded } from "@/lib/streak";

const SNAPSHOT_KEY = "owdle.reminder";

function buildSnapshot(): string {
  // Idempotent: also backfills the streak from history on first read and
  // ticks it over if today just became complete. Safe to call repeatedly.
  const s = bumpStreakIfNeeded();
  const day = dayString();
  return JSON.stringify({
    current: s.current,
    longest: s.longest,
    lastCompletedDay: s.lastCompletedDay,
    todayDone: s.lastCompletedDay === day,
    day,
  });
}

export function ExtensionBridge() {
  useEffect(() => {
    const write = () => {
      try {
        const raw = buildSnapshot();
        if (window.localStorage.getItem(SNAPSHOT_KEY) !== raw) {
          window.localStorage.setItem(SNAPSHOT_KEY, raw);
        }
      } catch {
        // storage blocked (private mode / quota) — nothing to do
      }
    };

    write();

    // Catch the streak ticking over (player finishes the last mode) or the
    // day rolling, without coupling into the game engines. Cheap local read;
    // only writes on an actual change.
    const onVisible = () => {
      if (document.visibilityState === "visible") write();
    };
    const interval = window.setInterval(onVisible, 5000);
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", write);

    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", write);
    };
  }, []);

  return null;
}
