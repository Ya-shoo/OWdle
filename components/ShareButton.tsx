"use client";

import { ReactNode, useCallback, useRef, useState } from "react";
import { captureNodePng, tryNativeShare } from "@/lib/share-image";
import { trackShareClicked } from "@/lib/tracking";
import type { ModeSlug } from "@/lib/modes";
import { ShareModal } from "./ShareModal";

// Share affordance with two paths:
//
//   1. **Touch-primary devices** (phones, tablets) — fire navigator.share
//      with the image + url payload. The OS share sheet handles image+link
//      together natively (iMessage, WhatsApp, etc. all parse this fine).
//      Cheap, instant, and matches platform expectations.
//
//   2. **Pointer-primary devices** (desktop, laptop) — open ShareModal.
//      The clipboard can only hold one mime-type at a time on desktop
//      browsers, so the modal exposes explicit Copy-Image / Copy-Link /
//      Download / X-intent actions instead of pretending both payloads
//      get packed into one paste. Reliable; no "two identical images
//      pasted" surprise from desktop share-sheet quirks.
//
// The split is gated by `(pointer: coarse)` rather than user-agent
// sniffing — touch laptops still get the modal, iPad with magic
// keyboard still gets native share, which matches what each device
// actually does best.

type Props = {
  // Render function for the share card. Returns the offscreen card
  // node — modal and mobile-native paths both invoke it on demand.
  // (Render-fn shape preserved so we can plumb options through later
  // without a callsite-wide rewrite.)
  renderCard: () => ReactNode;
  url: string;
  text: string;
  filename: string;
  surface: "round_result" | "daily_complete" | "streak_rank";
  mode?: ModeSlug;
  dailyId: string;
  variant?: "primary" | "soft";
  label?: string;
};

export function ShareButton({
  renderCard,
  url,
  text,
  filename,
  surface,
  mode,
  dailyId,
  variant = "primary",
  label = "Share",
}: Props) {
  const cardRef = useRef<HTMLDivElement>(null);
  const [busy, setBusy] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  // Latched busy flag — guards against the double-click race where the
  // user fires onClick twice before React renders the disabled state.
  const inFlightRef = useRef(false);

  const handleClick = useCallback(async () => {
    if (inFlightRef.current) return;
    inFlightRef.current = true;
    setBusy(true);
    try {
      // Touch-primary devices (mobile) attempt the OS share sheet first.
      // Mobile handles the image+url combo correctly. If the share API
      // is unavailable OR the user actually shared OR cancelled, we're
      // done. Only a genuine "failed" outcome bumps the flow to the
      // modal so the user has explicit alternatives.
      if (prefersNativeShare()) {
        const node = cardRef.current;
        if (node) {
          const blob = await captureNodePng(node);
          const outcome = await tryNativeShare({
            blob,
            filename,
            url,
            text,
            title: text,
          });
          if (outcome === "shared") {
            trackShareClicked({ surface, method: "native", dailyId, mode });
            return;
          }
          if (outcome === "canceled") {
            trackShareClicked({ surface, method: "canceled", dailyId, mode });
            return;
          }
          // unavailable | failed → fall through to modal so the user
          // can pick Copy Image / Copy Link / Download manually.
        }
      }

      // Desktop / pointer-primary OR mobile-native fell through. Open
      // the modal — it does its own capture and exposes explicit Copy /
      // Download / X-intent actions. PostHog events fire from inside
      // the modal (one per action).
      setModalOpen(true);
    } finally {
      setBusy(false);
      inFlightRef.current = false;
    }
  }, [filename, url, text, surface, mode, dailyId]);

  const btnClass =
    variant === "primary"
      ? "group inline-flex items-center gap-2 rounded-full bg-info/15 px-5 py-3 text-info ring-1 ring-info/40 transition-all hover:bg-info/25 hover:ring-info active:scale-[0.98] disabled:opacity-50"
      : "group inline-flex items-center gap-2 rounded-full border border-line bg-inset/40 px-4 py-2 text-ink-soft transition-colors hover:border-info/60 hover:text-info active:scale-[0.98] disabled:opacity-50";

  return (
    <>
      <button
        type="button"
        onClick={handleClick}
        disabled={busy}
        aria-label={label}
        className={btnClass}
      >
        {busy ? <Spinner /> : <ShareGlyph />}
        <span className="font-mono text-[11px] uppercase tracking-[0.22em]">
          {busy ? "Preparing…" : label}
        </span>
      </button>

      {/* Mobile/native path needs the offscreen card painted in the DOM
          so captureNodePng can read it. Desktop path mounts its own copy
          inside ShareModal, so this node is unused in that case (harmless
          — modern-screenshot only reads from cardRef on demand). */}
      <div
        ref={cardRef}
        aria-hidden
        style={{
          position: "fixed",
          left: -100000,
          top: 0,
          pointerEvents: "none",
        }}
      >
        {renderCard()}
      </div>

      {modalOpen && (
        <ShareModal
          renderCard={renderCard}
          url={url}
          text={text}
          filename={filename}
          surface={surface}
          mode={mode}
          dailyId={dailyId}
          onClose={() => setModalOpen(false)}
        />
      )}
    </>
  );
}

// Whether to route this share through the OS share sheet vs. the modal.
// Touch-primary devices answer "yes" — that's where Web Share with files
// is reliable. Desktop platforms (including Mac Safari, which technically
// supports share-with-files but produces the "two identical images
// pasted" failure mode in Discord-style clipboard parsers) all get the
// modal.
//
// We gate on touch capability (`maxTouchPoints > 0`) PLUS the absence
// of desktop OS markers in the UA. `(pointer: coarse)` alone was too
// permissive on some Mac trackpads, which is what caused the original
// bug report.
function prefersNativeShare(): boolean {
  if (typeof navigator === "undefined") return false;
  if (typeof navigator.share !== "function") return false;
  // No touch capability → desktop or virtual machine; modal path.
  if (!("maxTouchPoints" in navigator) || navigator.maxTouchPoints <= 0) {
    return false;
  }
  // Touchpoints exist but UA names a desktop OS → modal path.
  // iPadOS reports as "Macintosh" in UA + has touch; that's the one
  // overlap we want to keep on native share, so we *only* exclude when
  // UA is desktop AND touchpoints are 0/1 (real Mac trackpads report 0).
  const ua = navigator.userAgent || "";
  const isDesktopUa = /Windows|Linux|CrOS/i.test(ua);
  if (isDesktopUa) return false;
  // Mac in UA + touch>1 = iPadOS (real Mac is touch=0; iPadOS spoofs Mac
  // UA but exposes touch). Mac UA + touch=0 already returned above.
  return true;
}

function ShareGlyph() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden
      className="transition-transform group-hover:-translate-y-0.5"
    >
      <path
        d="M12 3v12M12 3l-4 4M12 3l4 4M5 14v5a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-5"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function Spinner() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      aria-hidden
      className="animate-spin"
    >
      <circle
        cx="12"
        cy="12"
        r="9"
        stroke="currentColor"
        strokeOpacity="0.25"
        strokeWidth="3"
        fill="none"
      />
      <path
        d="M21 12a9 9 0 0 0-9-9"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
        fill="none"
      />
    </svg>
  );
}
