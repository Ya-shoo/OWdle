"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "motion/react";

// First-visit "how to play" card. Pops ONCE for a genuinely new browser,
// on whatever page they land on (home, /sound, /classic, a shared link, …),
// because it is mounted site-wide from the root layout next to
// ShareAnnounceModal. Dismiss is in-place: the card just closes over the page
// the visitor arrived at, so a friend-shared /sound link still drops them into
// Sound once they close it.
//
// Returning players never see it. We gate on real GAME state, not "any owdle
// key", because ExtensionBridge writes owdle.reminder on every load and the
// streak backfill writes a zeroed owdle.streak — neither means the visitor has
// played. This mirrors lib/storage.ts isFirstDay(), but also counts TODAY's
// play (someone mid-first-day is no longer seeing the site for the first time).

const SEEN_KEY = "owdle.tutorial.seen";

// Per-mode round state is the one unambiguous "has played" signal. Written
// only once a visitor actually guesses in a mode on a given day
// (owdle.<mode>.<YYYY-MM-DD>, see lib/storage.ts key()).
const MODE_STATE_RE =
  /^owdle\.(classic|sound|quote|splash|ability|melee|map)\.\d{4}-\d{2}-\d{2}$/;

// Let the page paint first so the card reads as a deliberate greeting rather
// than an instant wall in front of a blank screen.
const REVEAL_DELAY_MS = 450;

function hasSeenTutorial(): boolean {
  try {
    return window.localStorage.getItem(SEEN_KEY) === "1";
  } catch {
    return false;
  }
}

function hasPlayedBefore(): boolean {
  try {
    for (let i = 0; i < window.localStorage.length; i++) {
      const k = window.localStorage.key(i) ?? "";
      // Any real round state, of any day, means this browser has played.
      if (MODE_STATE_RE.test(k)) return true;
      // Archive play is a returning-player feature by definition.
      if (k.startsWith("owdle.archive.")) return true;
    }
    // A real streak survives even if per-day keys were pruned. A zeroed streak
    // (current 0, no lastCompletedDay) is what the backfill writes for a brand
    // new browser, so it must NOT count.
    const rawStreak = window.localStorage.getItem("owdle.streak");
    if (rawStreak) {
      const s = JSON.parse(rawStreak) as {
        lastCompletedDay?: unknown;
        longest?: unknown;
      };
      if (typeof s?.lastCompletedDay === "string") return true;
      if (typeof s?.longest === "number" && s.longest > 0) return true;
    }
    return false;
  } catch {
    // Storage blocked (private mode / quota): we could not persist a dismissal
    // anyway, so it would re-pop every load. Treat as "played" and stay quiet.
    return true;
  }
}

// ---------------------------------------------------------------------------
// Copy — instructional register (ASD-STE100). Kept as plain constants so the
// voice is easy to adjust in one place without touching the layout.
// ---------------------------------------------------------------------------

const LEAD_1 = "OWdle is a daily Overwatch quiz.";

// Canonical play order (lib/modes.ts BUILT_MODE_SLUGS): classic, sound, quote,
// splash (Spotlight), ability. Each mode has its OWN daily hero. Descriptions
// are Yash's own words — kept verbatim.
// href is the mode's route. Note Spotlight lives at /splash/ (its slug),
// not /spotlight/.
const TUTORIAL_MODES: { label: string; href: string; desc: string }[] = [
  {
    label: "Classic",
    href: "/classic/",
    desc: "Standard Wordle-like game mode, where you guess the hero and get clues based on your previous guesses",
  },
  {
    label: "Sound",
    href: "/sound/",
    desc: "Guess the hero based on their gradually revealed ability sound",
  },
  {
    label: "Quote",
    href: "/quote/",
    desc: "Guess which two heroes are having the pre-match conversation, with audio hints",
  },
  {
    label: "Spotlight",
    href: "/splash/",
    desc: "Guess the hero based on the gradually revealed splashart",
  },
  {
    label: "Ability",
    href: "/ability/",
    desc: "Guess the hero based on their gradually revealed ability icon",
  },
];

const DAILY_RESET = "2:15am Pacific";
const DAILY_STREAK_LINE =
  "Finish all five modes to complete the day and grow your streak.";

const CTA_PRIMARY = "Start playing";

export function WelcomeTutorial() {
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const pathname = usePathname();

  // Close the overlay once a route change COMMITS. The nav links below set the
  // seen flag but deliberately do NOT close the card on click — the overlay
  // stays up covering the page through the whole navigation (including dev's
  // on-demand route compile), so what appears when it closes is the
  // destination, never a flash of the page behind it.
  useEffect(() => {
    // Deliberate router sync: hide the card once the route commits. Runs at
    // most once per navigation (no cascade), and also covers browser back/
    // forward so it never re-appears on a return to the landing route.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setOpen(false);
  }, [pathname]);

  // New-users-only gate. Show ONLY when this browser has neither seen the
  // card before nor played any mode — i.e. a genuinely new visitor. Returning
  // players (real game state) and anyone who already dismissed it are skipped.
  // Client-only: the initial render is always null (matches the static-export
  // SSR output), so there is no hydration mismatch.
  useEffect(() => {
    if (hasSeenTutorial() || hasPlayedBefore()) return;
    const t = window.setTimeout(() => setOpen(true), REVEAL_DELAY_MS);
    return () => window.clearTimeout(t);
  }, []);

  // Dev-only: WelcomeTutorialDevTrigger dispatches this so the card can be
  // previewed on demand, bypassing the seen/played gate and without touching
  // storage. Gated on the build-time NODE_ENV, so it tree-shakes out of prod.
  useEffect(() => {
    if (process.env.NODE_ENV !== "development") return;
    const onForce = () => setOpen(true);
    window.addEventListener("owdle:show-tutorial", onForce);
    return () => window.removeEventListener("owdle:show-tutorial", onForce);
  }, []);

  const markSeen = useCallback(() => {
    try {
      window.localStorage.setItem(SEEN_KEY, "1");
    } catch {
      // Private mode — the in-memory close still hides it for this session.
    }
  }, []);

  // X / Esc / backdrop: close in place immediately (no navigation).
  const dismiss = useCallback(() => {
    markSeen();
    setOpen(false);
  }, [markSeen]);

  // Mode cell / Start playing: mark seen and let the <Link> navigate, keeping
  // the overlay up until the route commits (the pathname effect closes it). If
  // we are already on the target route no route change fires, so close now.
  const handleNavClick = (href: string) => () => {
    markSeen();
    const norm = (p: string) => (p.endsWith("/") ? p : `${p}/`);
    if (norm(pathname) === norm(href)) setOpen(false);
  };

  // Lock background scroll, wire Esc, and land focus on the primary action.
  useEffect(() => {
    if (!open) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") dismiss();
    };
    window.addEventListener("keydown", onKey);
    // Land focus on the dialog itself (not the CTA) so a mouse user sees no
    // stray ring, while a keyboard user Tabs into the actions and rings them.
    panelRef.current?.focus();
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener("keydown", onKey);
    };
  }, [open, dismiss]);

  if (!open || typeof document === "undefined") return null;

  const overlay = (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="welcome-tutorial-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) dismiss();
      }}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 2147483000,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "rgba(0,0,0,0.72)",
        backdropFilter: "blur(4px)",
        WebkitBackdropFilter: "blur(4px)",
        padding: "16px",
      }}
    >
      <motion.div
        ref={panelRef}
        tabIndex={-1}
        initial={{ opacity: 0, y: 12, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        // Hover-pop to match the home mode cards (see HomeContent card:
        // hover:-translate-y-0.5 hover:scale-[1.02] + ease-spring). Transform
        // is motion-owned, so the lift rides whileHover; the shadow swap is a
        // Tailwind class below (motion never touches box-shadow here).
        whileHover={{ y: -3, scale: 1.02 }}
        transition={{ duration: 0.2, ease: [0.34, 1.56, 0.64, 1] }}
        // cursor-default + select-none: the mode cells hold selectable text, so
        // without this the pointer flips to an I-beam over the card. Keep it a
        // plain arrow (the cells aren't clickable); the buttons re-assert
        // cursor-pointer below. Scoped to this panel only.
        className="w-full max-w-[480px] max-h-[94vh] cursor-default select-none overflow-auto border border-line text-ink shadow-card transition-shadow duration-200 hover:shadow-card-hover"
        // Explicit solid panel — the themed --bg-surface reads translucent
        // against the blurred page behind the overlay (see ShareAnnounceModal).
        // outline:none inline — the container is only a focus landing spot, so
        // it must not paint the global :focus-visible ring (the interactive
        // children keep theirs). Inline beats the stylesheet rule. Corner radius
        // is the shared card token so it matches the home mode cards.
        style={{
          borderRadius: "var(--radius-card)",
          background: "#11161f",
          outline: "none",
        }}
      >
        <div className="flex items-center justify-between border-b border-line px-4 py-2">
          <p className="utility-label text-[10px] text-info">
            <span className="rounded-full bg-info px-2 py-0.5 text-on-info">
              New here
            </span>
          </p>
          <button
            type="button"
            onClick={dismiss}
            className="-mr-1 cursor-pointer px-2 py-1 font-mono text-base leading-none text-ink-soft transition-colors hover:text-ink"
            aria-label="Close"
          >
            ×
          </button>
        </div>

        <div className="px-5 pt-4 pb-4">
          <h2
            id="welcome-tutorial-title"
            className="font-display display-headline uppercase text-2xl leading-[0.95] text-ink"
          >
            Welcome to <span className="text-accent">OWdle</span>!
          </h2>

          <p className="mt-2 text-[13px] leading-snug text-ink-soft">{LEAD_1}</p>

          <p className="mt-2.5 mb-1.5 utility-label text-[11px] text-info">
            The five daily modes
          </p>

          <ul className="space-y-1.5">
            {TUTORIAL_MODES.map((m) => (
              <li key={m.label}>
                {/* Each mode is its own solid clickable cell (bg-muted lifted
                    off the #11161f panel) that jumps to that mode and dismisses
                    the card. Lifts on hover like the home mode cards; Tailwind
                    hover (not motion) so it composes with the panel's own
                    whileHover lift. Body color stays fixed — only the transform
                    + shadow animate. cursor-pointer re-asserts the hand over the
                    panel's cursor-default. */}
                <Link
                  href={m.href}
                  onClick={handleNavClick(m.href)}
                  className="flex min-h-[80px] cursor-pointer flex-col justify-center rounded-(--radius-card) border border-line bg-card px-4 transition-[transform,box-shadow] duration-200 ease-[var(--ease-spring)] hover:-translate-y-0.5 hover:scale-[1.02] hover:shadow-[0_3px_8px_-3px_rgba(0,0,0,0.45)]"
                >
                  <p className="font-display display-headline uppercase text-[15px] leading-tight text-ink">
                    {m.label}
                  </p>
                  <p className="mt-0.5 text-[13px] leading-snug text-ink-soft [text-wrap:pretty]">
                    {m.desc}
                  </p>
                </Link>
              </li>
            ))}
          </ul>

          <div className="mt-2 border-t border-line pt-2">
            <p className="text-[13px] leading-snug text-ink-soft">
              Puzzles refresh at{" "}
              <span className="font-mono text-ink">{DAILY_RESET}</span>
            </p>
            <p className="mt-0.5 text-[13px] leading-snug text-ink-soft">
              {DAILY_STREAK_LINE}
            </p>
          </div>

          <div className="mt-3 flex justify-center">
            {/* Start playing sends first-timers to Classic (the canonical
                first mode) and dismisses the card. */}
            <Link
              href="/classic/"
              onClick={handleNavClick("/classic/")}
              // Pop on hover, matching the home "Begin" CTA: lift + scale-1.04
              // + brighten to accent-soft + a deeper shadow, spring-eased.
              className="utility-label inline-flex cursor-pointer items-center justify-center rounded-full bg-accent px-12 py-3 text-base text-on-accent shadow-[0_3px_10px_-2px_rgba(0,0,0,0.5)] transition-all duration-200 ease-[var(--ease-spring)] hover:-translate-y-0.5 hover:scale-[1.04] hover:bg-accent-soft hover:shadow-[0_5px_14px_-2px_rgba(0,0,0,0.5)] active:scale-[0.98] active:shadow-[0_2px_5px_-1px_rgba(0,0,0,0.4)]"
            >
              {CTA_PRIMARY}
            </Link>
          </div>
        </div>
      </motion.div>
    </div>
  );

  return createPortal(overlay, document.body);
}
