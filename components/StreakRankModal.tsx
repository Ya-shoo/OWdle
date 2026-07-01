"use client";

import { useEffect } from "react";
import { motion } from "motion/react";
import { createPortal } from "react-dom";
import { dayString } from "@/lib/daily";
import { SITE_URL } from "@/lib/site";
import {
  STREAK_TIER_ACCENT,
  STREAK_TIER_LABEL,
  STREAK_TIER_PERCENTILE_MAX,
  type StreakTier,
} from "@/lib/streakRank";
import { ShareButton } from "./ShareButton";
import { StreakRankShareCard } from "./StreakRankShareCard";

// On-promotion celebration. Auto-opened by StreakRankBadge the first time a
// player reaches a new, higher streak tier; also re-openable by tapping the
// header pill. Mirrors ShareModal's overlay mechanics (portal to body, Esc
// to close, scroll lock, backdrop-click close) with a celebratory spring.

type Props = {
  tier: StreakTier;
  streak: number;
  onClose: () => void;
};

export function StreakRankModal({ tier, streak, onClose }: Props) {
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  if (typeof document === "undefined") return null;

  const accent = STREAK_TIER_ACCENT[tier];
  const label = STREAK_TIER_LABEL[tier];
  const pct = STREAK_TIER_PERCENTILE_MAX[tier];

  const overlay = (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`New streak rank: ${label}`}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
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
        padding: 16,
      }}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.9, y: 16 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ type: "spring", stiffness: 260, damping: 22 }}
        className="relative w-full max-w-[420px] overflow-hidden border border-line bg-surface text-ink"
        style={{ borderRadius: 16 }}
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="absolute right-3 top-2.5 z-10 px-2 py-1 font-mono text-base leading-none text-ink-soft transition-colors hover:text-ink"
        >
          ×
        </button>

        <div className="relative flex flex-col items-center gap-3 px-6 pb-6 pt-7 text-center">
          <span
            className="font-mono text-[10px] uppercase tracking-[0.28em]"
            style={{ color: accent }}
          >
            New streak rank
          </span>

          {/* Badge pop. */}
          <motion.div
            initial={{ scale: 0.5, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: "spring", stiffness: 220, damping: 14, delay: 0.08 }}
            className="relative my-1"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={`/ranks/${tier}.png`}
              alt={label}
              width={132}
              height={132}
              style={{ width: 132, height: 132 }}
              className="relative object-contain drop-shadow-[0_8px_24px_rgba(0,0,0,0.5)]"
            />
          </motion.div>

          <h2 className="font-display text-2xl font-bold tracking-tight text-ink">
            Wow! Congrats :O
          </h2>

          <p className="font-display text-lg font-semibold leading-snug text-ink">
            You&apos;re <span style={{ color: accent }}>{label}</span> among
            OWdle streak holders.
          </p>

          <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-ink-faint">
            <span className="tabular-nums text-accent">{streak}</span>-day streak
            {" · "}top{" "}
            <span className="tabular-nums text-accent-soft">{pct}</span>%
          </p>

          <div className="mt-3 flex w-full flex-col items-center gap-2">
            {/* No ogImageUrl — streak rank has no personalized unfurl,
                so the share modal previews the client-rendered card. */}
            <ShareButton
              renderCard={() => (
                <StreakRankShareCard tier={tier} streak={streak} />
              )}
              url={SITE_URL}
              filename={`owdle-streak-${tier}.png`}
              surface="streak_rank"
              dailyId={dayString()}
              label="Share your rank"
            />
            <button
              type="button"
              onClick={onClose}
              className="font-mono text-[10px] uppercase tracking-[0.2em] text-ink-faint transition-colors hover:text-ink-soft"
            >
              Keep it going
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );

  return createPortal(overlay, document.body);
}
