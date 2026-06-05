"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { motion } from "motion/react";
import { ogImageUrlForCode, ogPreviewSrc } from "@/lib/shareLinks";
import { trackShareAnnounce } from "@/lib/tracking";

// One-time release announcement for the link-share system. Pops once
// for RETURNING players (anyone with prior owdle state) — they played
// without sharing, so "you can now share" is news to them; brand-new
// players discover the Share button organically on their first result
// and never see this. Mounted site-wide from the root layout so it
// greets returning players on whatever page they land on.

const SEEN_KEY = "owdle.announce.shareLinks";

// Stop announcing entirely two weeks after the feature launched —
// after that it isn't news, and without a cutoff every new player
// would get the popup on their SECOND visit (once they have state).
// Module-scope so the Date read stays out of render (purity rules).
const ANNOUNCE_EXPIRED =
  Date.now() > new Date("2026-06-19T00:00:00-07:00").getTime();

// Fixed example card: a daily 5/5 sweep (date 2026-06-05, results
// 3/2/4/3/2, no hints/skips). Hardcoding the code keeps this component
// pure — encoding live results would need today's date in render — and
// the image is immutable + permanently edge-cached anyway. It renders
// with the CURRENT card design since the OG worker draws it live.
const EXAMPLE_CODE = "260605-32432-00";

function subscribeNever(): () => void {
  return () => {};
}

// Snapshot: should the announcement pop for this browser? Read-only
// (no side effects — snapshots re-run every render) and stable until
// localStorage changes.
function shouldAnnounce(): boolean {
  if (ANNOUNCE_EXPIRED) return false;
  try {
    if (window.localStorage.getItem(SEEN_KEY) === "1") return false;
    // Returning-player heuristic: any prior owdle state at all.
    for (let i = 0; i < window.localStorage.length; i++) {
      const k = window.localStorage.key(i) ?? "";
      if (k.startsWith("owdle") && k !== SEEN_KEY) return true;
    }
    return false;
  } catch {
    return false;
  }
}

export function ShareAnnounceModal() {
  const eligible = useSyncExternalStore(
    subscribeNever,
    shouldAnnounce,
    () => false,
  );
  const [dismissed, setDismissed] = useState(false);
  const [imgFailed, setImgFailed] = useState(false);
  const open = eligible && !dismissed;

  // Track the pop exactly once per mount-session.
  useEffect(() => {
    if (!open) return;
    trackShareAnnounce({ action: "shown" });
    // Intentionally not re-armed: `open` only transitions true→false.
  }, [open]);

  // Esc-to-close, matching ShareModal.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        try {
          window.localStorage.setItem(SEEN_KEY, "1");
        } catch {
          // private mode — in-memory dismissal only
        }
        setDismissed(true);
        trackShareAnnounce({ action: "dismissed" });
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const dismiss = () => {
    try {
      window.localStorage.setItem(SEEN_KEY, "1");
    } catch {
      // Private mode — the in-memory dismissal still hides it for now.
    }
    setDismissed(true);
    trackShareAnnounce({ action: "dismissed" });
  };

  if (!open || typeof document === "undefined") return null;

  const exampleSrc = imgFailed
    ? null
    : ogPreviewSrc(ogImageUrlForCode(EXAMPLE_CODE));

  const overlay = (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="New: share your results"
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
        background: "rgba(0,0,0,0.7)",
        backdropFilter: "blur(4px)",
        WebkitBackdropFilter: "blur(4px)",
        padding: "16px",
      }}
    >
      <motion.div
        initial={{ opacity: 0, y: 12, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
        className="w-full max-w-[420px] max-h-[92vh] overflow-auto border border-line text-ink"
        // Explicit solid panel — the themed --bg-surface (warm seasonal
        // variants especially) read as semi-transparent against the
        // blurred page behind the overlay.
        style={{ borderRadius: 14, background: "#11161f" }}
      >
        <div className="flex items-center justify-between border-b border-line px-4 py-3">
          <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-info">
            <span className="mr-2 rounded-full bg-info px-2 py-0.5 text-on-info">
              New
            </span>
            Share your results
          </p>
          <button
            type="button"
            onClick={dismiss}
            className="-mr-1 px-2 py-1 font-mono text-base leading-none text-ink-soft transition-colors hover:text-ink"
            aria-label="Close"
          >
            ×
          </button>
        </div>

        <div className="flex flex-col gap-4 px-5 py-5">
          {exampleSrc && (
            <div
              className="relative mx-auto w-full max-w-[300px] overflow-hidden rounded-(--radius-card)"
              style={{ aspectRatio: "1 / 1" }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={exampleSrc}
                alt="Example share card showing a completed daily"
                onError={() => setImgFailed(true)}
                className="absolute inset-0 h-full w-full object-cover"
              />
            </div>
          )}

          <p className="text-sm leading-relaxed text-ink-soft">
            Finish any mode and hit{" "}
            <span className="font-semibold text-ink">Share</span>. You&apos;ll
            get a link that you can paste anywhere. Each mode has its own.
            Complete all five to share a daily summary card like this one.
            Enjoy!
          </p>

          <button
            type="button"
            onClick={dismiss}
            className="inline-flex w-full items-center justify-center rounded-full bg-info px-5 py-3 font-mono text-[12px] uppercase tracking-[0.22em] text-on-info transition-all hover:brightness-110 active:scale-[0.99]"
          >
            Got it
          </button>
        </div>
      </motion.div>
    </div>
  );

  return createPortal(overlay, document.body);
}
