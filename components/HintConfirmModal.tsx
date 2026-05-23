"use client";

import { useEffect, useRef } from "react";
import { AnimatePresence, motion } from "motion/react";

// Custom confirmation modal for the Hint button in ClassicGame.
// Replaces window.confirm() with an OWdle-styled prompt. We drive the
// open/close with motion/react's AnimatePresence so the dialog fades
// and lifts in/out — the native <dialog> element doesn't animate
// cleanly across showModal()/close() in every browser, so we
// hand-roll the backdrop + ESC + click-outside instead.

type Props = {
  open: boolean;
  effectiveRemaining: number;
  hintsLeftAfter: number;
  onConfirm: () => void;
  onCancel: () => void;
};

export function HintConfirmModal({
  open,
  effectiveRemaining,
  hintsLeftAfter,
  onConfirm,
  onCancel,
}: Props) {
  const confirmRef = useRef<HTMLButtonElement>(null);

  // ESC dismisses, matching the native <dialog> behaviour we replaced.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onCancel();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onCancel]);

  // Lock body scroll while open so backdrop click doesn't scroll the
  // game underneath when the player taps off the card.
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  // Pull focus to the confirm CTA shortly after the enter animation
  // kicks off so Enter-to-reveal flows feel snappy.
  useEffect(() => {
    if (!open) return;
    const t = window.setTimeout(() => confirmRef.current?.focus(), 60);
    return () => window.clearTimeout(t);
  }, [open]);

  const guessWord = effectiveRemaining === 1 ? "guess" : "guesses";

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          key="hint-modal-backdrop"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4 backdrop-blur-sm"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.16, ease: "easeOut" }}
          onClick={onCancel}
          aria-hidden
        >
          <motion.div
            key="hint-modal-card"
            role="dialog"
            aria-modal="true"
            aria-labelledby="hint-confirm-title"
            initial={{ opacity: 0, scale: 0.94, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.97, y: 4 }}
            transition={{
              duration: 0.22,
              ease: [0.16, 1, 0.3, 1],
            }}
            onClick={(e) => e.stopPropagation()}
            className="w-[min(440px,92vw)] max-w-[92vw] overflow-hidden border border-line bg-surface text-ink shadow-[0_20px_60px_-20px_rgba(0,0,0,0.75)]"
          >
            <div className="flex items-center justify-between border-b border-line px-4 py-3">
              <p
                id="hint-confirm-title"
                className="font-mono text-[10px] uppercase tracking-[0.22em] text-info"
              >
                Reveal a hint?
              </p>
              <button
                type="button"
                onClick={onCancel}
                className="-mr-1 px-2 py-1 font-mono text-base leading-none text-ink-soft transition-colors hover:text-ink"
                aria-label="Close"
              >
                ×
              </button>
            </div>

            <div className="flex flex-col gap-4 p-4">
              <p className="text-sm text-ink-soft">
                A hint reveals one attribute of the answer, but{" "}
                <span className="text-ink">costs you one guess.</span>
              </p>

              <div className="rounded-(--radius-card) border border-line/60 bg-inset/40 px-3 py-2.5 font-mono text-[10px] uppercase tracking-[0.18em] text-ink-faint">
                <div className="flex items-center justify-between">
                  <span>Guesses remaining</span>
                  <span className="text-ink">
                    {effectiveRemaining} →{" "}
                    {Math.max(0, effectiveRemaining - 1)}
                  </span>
                </div>
                <div className="mt-1 flex items-center justify-between">
                  <span>Hints left after this</span>
                  <span className="text-ink">
                    {Math.max(0, hintsLeftAfter)}
                  </span>
                </div>
              </div>

              <div className="flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={onCancel}
                  className="border border-line bg-surface px-4 py-2 font-mono text-[10px] uppercase tracking-[0.22em] text-ink-soft transition-colors hover:border-ink hover:text-ink"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  ref={confirmRef}
                  onClick={onConfirm}
                  className="border border-accent bg-accent px-4 py-2 font-mono text-[10px] uppercase tracking-[0.22em] text-on-accent transition-opacity hover:opacity-90"
                >
                  Reveal hint
                </button>
              </div>

              {effectiveRemaining <= 2 && (
                <p className="font-mono text-[9px] uppercase tracking-[0.2em] text-ink-faint">
                  Only {effectiveRemaining} {guessWord} left.
                </p>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
