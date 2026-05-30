"use client";

// Dev-only floating chip that lets you preview every surface palette —
// the three rotating ones (blue / warm / green) plus the seven holiday
// themes — without waiting for the calendar. Tree-shaken from prod via
// the build-time NODE_ENV constant: the body returns null and the
// import is dropped from the bundle.
//
// Behavior:
//   - On mount, applies any saved override from localStorage so the
//     chosen theme survives refresh during a dev session.
//   - Click a chip to override data-theme on <html> and persist.
//   - "auto" clears the override and snaps to whatever lib/theme's
//     pickTheme() would pick right now (holiday window first, otherwise
//     the 3-day rotation).

import { useEffect, useState } from "react";
import clsx from "clsx";
import {
  ALL_THEMES,
  HOLIDAY_THEMES,
  ROTATING_THEMES,
  THEME_LABEL,
  THEME_TITLE,
  type Theme,
  pickTheme,
} from "@/lib/theme";

const STORAGE_KEY = "owdle:dev-theme-override";
const ALL_THEMES_SET = new Set<string>(ALL_THEMES);

export function DevThemeSwitcher() {
  if (process.env.NODE_ENV !== "development") return null;
  return <DevThemeSwitcherInner />;
}

function DevThemeSwitcherInner() {
  const [current, setCurrent] = useState<Theme | null>(null);

  useEffect(() => {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (saved && ALL_THEMES_SET.has(saved)) {
      document.documentElement.setAttribute("data-theme", saved);
      setCurrent(saved as Theme);
    } else {
      const attr = document.documentElement.getAttribute("data-theme");
      if (attr && ALL_THEMES_SET.has(attr)) setCurrent(attr as Theme);
    }
  }, []);

  const apply = (t: Theme) => {
    document.documentElement.setAttribute("data-theme", t);
    window.localStorage.setItem(STORAGE_KEY, t);
    setCurrent(t);
  };

  const clearOverride = () => {
    window.localStorage.removeItem(STORAGE_KEY);
    const t = pickTheme(new Date());
    document.documentElement.setAttribute("data-theme", t);
    setCurrent(t);
  };

  return (
    <div className="fixed bottom-3 left-3 z-50 flex flex-col gap-1 rounded-2xl border border-line bg-canvas/85 px-2.5 py-2 font-mono text-[10px] uppercase tracking-[0.2em] text-ink-faint shadow-lg backdrop-blur-sm">
      <div className="flex items-center gap-1">
        <span className="w-12 px-1 text-ink-soft">Cycle</span>
        {ROTATING_THEMES.map((t) => (
          <ThemeChip
            key={t}
            theme={t}
            active={current === t}
            onClick={() => apply(t)}
          />
        ))}
        <button
          type="button"
          onClick={clearOverride}
          title="Clear override (date-driven pick)"
          className="ml-1 rounded-full border border-line px-2 py-0.5 text-ink-soft transition-colors hover:text-ink"
        >
          auto
        </button>
      </div>
      <div className="flex items-center gap-1">
        <span className="w-12 px-1 text-ink-soft">Hol</span>
        {HOLIDAY_THEMES.map((t) => (
          <ThemeChip
            key={t}
            theme={t}
            active={current === t}
            onClick={() => apply(t)}
          />
        ))}
      </div>
    </div>
  );
}

function ThemeChip({
  theme,
  active,
  onClick,
}: {
  theme: Theme;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={THEME_TITLE[theme]}
      className={clsx(
        "rounded-full px-2 py-0.5 transition-colors",
        active
          ? "bg-accent text-on-accent"
          : "text-ink-soft hover:text-ink",
      )}
    >
      {THEME_LABEL[theme]}
    </button>
  );
}
