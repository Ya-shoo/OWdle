import Link from "next/link";
import { MODES } from "@/lib/modes";

// Discovery nudge for the daily-complete surfaces (the per-mode
// DailyCompleteResultCard and the home DailyCompleteHero). Once a player
// finishes the five daily modes, this points them at the bonus modes —
// playable islands OUTSIDE the daily with no streak/rank coupling.
//
// Two looks:
//   • "pill"   — compact, sits inline next to the streak badge on the home
//     complete hero.
//   • "banner" — a full-width accent CTA that reads as a real "next thing
//     to do", used directly under the in-game daily-complete card.
//
// Links to the first live bonus mode (Melee today). Renders nothing if no
// bonus mode is built, so it self-hides until one ships. Revisit a bonus
// rollup/index destination when there are 3+ bonus modes; one link is right
// for one mode.
const FIRST_BONUS = MODES.find((m) => m.built && m.tier === "bonus") ?? null;

export function TryBonusRoundNudge({
  variant = "pill",
  className = "",
}: {
  variant?: "pill" | "banner";
  className?: string;
}) {
  if (!FIRST_BONUS) return null;

  if (variant === "banner") {
    // Solid-accent CTA matching the Begin / next-mode buttons: full orange
    // fill, dark on-accent text, content-width and centered (smaller than a
    // full-bleed bar), hover-scales. The prominent "what to do next" push.
    return (
      <Link
        href={`/${FIRST_BONUS.slug}/`}
        className={
          "inline-flex flex-col items-center gap-1.5 rounded-(--radius-card) bg-accent px-10 py-3.5 text-center shadow-[0_2px_8px_-1px_rgba(0,0,0,0.4),0_0_6px_-1px_var(--accent)] transition-all duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] hover:scale-[1.03] hover:bg-accent-soft active:scale-[0.98] " +
          className
        }
      >
        <span className="font-display text-xl font-bold uppercase leading-none tracking-[0.16em] text-on-accent">
          Play
        </span>
        <span className="font-display text-sm font-semibold uppercase leading-none tracking-[0.2em] text-on-accent/85">
          {FIRST_BONUS.label} Mode
        </span>
      </Link>
    );
  }

  return (
    <Link
      href={`/${FIRST_BONUS.slug}/`}
      className={
        "group inline-flex items-center gap-2 rounded-full border border-accent/40 bg-accent/10 px-4 py-2 font-mono text-[11px] uppercase tracking-[0.2em] text-accent transition-colors hover:border-accent hover:bg-accent/15 " +
        className
      }
    >
      Try a bonus round: {FIRST_BONUS.label}
      <span
        aria-hidden
        className="transition-transform duration-200 group-hover:translate-x-0.5"
      >
        →
      </span>
    </Link>
  );
}
