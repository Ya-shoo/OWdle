"use client";

import { useEffect, useState } from "react";

// Dev-only "view" toggle that sits above each game mode. Two states:
// "User" hides every Dev panel (clean preview of the shipping game) and
// "Dev" reveals the per-mode picker + helper controls.
//
// Visibility gate matches useShowDevControls in MapGame and DevHubHeader
// — render-null on SSR + first paint to dodge hydration mismatches,
// then flip on once we've confirmed we're on a dev build or localhost.
//
// Choice is persisted per-mode in localStorage so a reload preserves
// whichever lens the developer was last in for that game.

const storageKey = (mode: string) => `owdle.dev.view.${mode}`;

function useShowDev(): boolean {
  const [show, setShow] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const isDev = process.env.NODE_ENV === "development";
    const isLocal = ["localhost", "127.0.0.1"].includes(
      window.location.hostname,
    );
    setShow(isDev || isLocal);
  }, []);
  return show;
}

export function useDevViewState(mode: string): readonly [boolean, (next: boolean) => void] {
  const [active, setActive] = useState(false);
  // Hydrate from localStorage on mount. Default to false (User view) so
  // a first-time dev sees the shipping game first, then opts in.
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      if (window.localStorage.getItem(storageKey(mode)) === "1") {
        setActive(true);
      }
    } catch {
      // ignore — storage unavailable
    }
  }, [mode]);
  const update = (next: boolean) => {
    setActive(next);
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(storageKey(mode), next ? "1" : "0");
    } catch {
      // ignore
    }
  };
  return [active, update] as const;
}

type Props = {
  mode: string;
  active: boolean;
  onChange: (active: boolean) => void;
  className?: string;
};

export function DevViewToggle({ mode, active, onChange, className }: Props) {
  const show = useShowDev();
  if (!show) return null;
  // void mode — the mode prop is documentation/analytics-only; the hook
  // owns the persistence path. Keep it on the API so callers stay
  // explicit about which game the toggle belongs to.
  void mode;
  return (
    <div
      className={
        "mx-auto mb-4 inline-flex items-center gap-2 rounded-(--radius-pill) border border-dashed border-accent/50 bg-accent/5 px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.2em] " +
        (className ?? "")
      }
    >
      <span className="text-accent">Dev view</span>
      <div className="flex items-center gap-1">
        <button
          type="button"
          aria-pressed={!active}
          onClick={() => onChange(false)}
          className={
            "rounded-(--radius-pill) px-2.5 py-1 transition-colors " +
            (!active
              ? "bg-accent text-on-accent"
              : "text-ink-soft hover:text-accent")
          }
        >
          User
        </button>
        <button
          type="button"
          aria-pressed={active}
          onClick={() => onChange(true)}
          className={
            "rounded-(--radius-pill) px-2.5 py-1 transition-colors " +
            (active
              ? "bg-accent text-on-accent"
              : "text-ink-soft hover:text-accent")
          }
        >
          Dev
        </button>
      </div>
    </div>
  );
}
