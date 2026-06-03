"use client";

import { ReactNode, useCallback, useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { createPortal } from "react-dom";
import { captureNodePng } from "@/lib/share-image";
import { trackShareClicked } from "@/lib/tracking";
import type { ModeSlug } from "@/lib/modes";
import { SHARE_TEXT } from "@/lib/site";

// Desktop share modal. Renders the offscreen capture card on mount, snaps
// it to a PNG blob, shows a scaled-down preview, and exposes explicit
// Copy / Download / X-intent actions. The browser clipboard can't hold
// image AND text simultaneously, so this UI lets the user pick *which*
// payload they want rather than relying on the share-sheet's quirks.
//
// PostHog: each action fires share_clicked with a precise method tag so
// dashboards can see whether desktop users prefer copy-image, copy-link,
// download, or X intent.

type Props = {
  renderCard: () => ReactNode;
  url: string;
  text: string;
  filename: string;
  surface: "round_result" | "daily_complete" | "streak_rank";
  mode?: ModeSlug;
  dailyId: string;
  onClose: () => void;
};

export function ShareModal({
  renderCard,
  url,
  text,
  filename,
  surface,
  mode,
  dailyId,
  onClose,
}: Props) {
  const cardRef = useRef<HTMLDivElement>(null);
  const [blob, setBlob] = useState<Blob | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [captureError, setCaptureError] = useState<string | null>(null);
  // Per-action "✓ Copied" feedback. Key is the action id; value resets
  // after a short timeout. Centralized so two rapid clicks don't tangle
  // each other's feedback labels.
  const [confirmed, setConfirmed] = useState<
    "image" | "link" | "download" | null
  >(null);

  // Lock background scroll + wire Esc-to-close. We lost <dialog>'s
  // native Esc handler when switching to a div overlay; this restores
  // it. Portal target is document.body — modal must escape stacking
  // contexts from the result card's transform/opacity wrappers,
  // otherwise a parent could clip us.
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

  // Capture the offscreen card once it's painted. Re-runs whenever
  // `spoilers` flips so the preview + blob track the toggle. Two
  // animation frames guarantees Webfont layout + image decode have
  // completed (one isn't always enough — fonts that load lazily can
  // layout-shift the headline on the next frame).
  useEffect(() => {
    let cancelled = false;
    let createdUrl: string | null = null;
    const id = window.requestAnimationFrame(() => {
      window.requestAnimationFrame(async () => {
        if (cancelled) return;
        const node = cardRef.current;
        if (!node) return;
        try {
          const b = await captureNodePng(node);
          if (cancelled) return;
          createdUrl = URL.createObjectURL(b);
          setBlob(b);
          setPreviewUrl(createdUrl);
        } catch (err) {
          if (cancelled) return;
          setCaptureError(
            err instanceof Error ? err.message : "Capture failed.",
          );
        }
      });
    });
    return () => {
      cancelled = true;
      window.cancelAnimationFrame(id);
      if (createdUrl) URL.revokeObjectURL(createdUrl);
    };
  }, []);

  // Auto-clear the confirmation chip a beat after each action so a second
  // click on the same button feels responsive (not stuck on the prior ✓).
  useEffect(() => {
    if (confirmed == null) return;
    const id = window.setTimeout(() => setConfirmed(null), 1600);
    return () => window.clearTimeout(id);
  }, [confirmed]);

  const fireTrack = useCallback(
    (method:
      | "clipboard-image"
      | "clipboard-text"
      | "download"
      | "twitter_intent"
      | "error") => {
      trackShareClicked({ surface, method, dailyId, mode });
    },
    [surface, mode, dailyId],
  );

  const handleCopyImage = useCallback(async () => {
    if (!blob) return;
    if (
      typeof ClipboardItem === "undefined" ||
      !navigator.clipboard?.write
    ) {
      setCaptureError("Clipboard image API unavailable.");
      fireTrack("error");
      return;
    }
    // Multi-mime write — image AND URL in one ClipboardItem. Discord,
    // iMessage, and other Chrome/Edge-based desktop pastes pick up the
    // image as the attachment and surface the URL as the message text
    // automatically. Image-only pastes (image editors, browser drag
    // targets) still receive just the PNG. Some browsers (older
    // Safari) reject multi-mime; we fall back to image-only so the
    // primary payload still lands.
    const textBlob = new Blob([url], { type: "text/plain" });
    try {
      await navigator.clipboard.write([
        new ClipboardItem({ "image/png": blob, "text/plain": textBlob }),
      ]);
      setConfirmed("image");
      fireTrack("clipboard-image");
    } catch {
      try {
        await navigator.clipboard.write([
          new ClipboardItem({ "image/png": blob }),
        ]);
        setConfirmed("image");
        fireTrack("clipboard-image");
      } catch (err) {
        setCaptureError(
          err instanceof Error ? err.message : "Couldn't copy image.",
        );
        fireTrack("error");
      }
    }
  }, [blob, fireTrack, url]);

  const handleCopyLink = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(url);
      setConfirmed("link");
      fireTrack("clipboard-text");
    } catch (err) {
      setCaptureError(
        err instanceof Error ? err.message : "Couldn't copy link.",
      );
      fireTrack("error");
    }
  }, [url, fireTrack]);

  const handleDownload = useCallback(() => {
    if (!blob) return;
    const objUrl = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = objUrl;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    // Delay revoke so Safari has time to start the download before the
    // URL goes away — 1s is plenty for the click→download handoff.
    window.setTimeout(() => URL.revokeObjectURL(objUrl), 1000);
    setConfirmed("download");
    fireTrack("download");
  }, [blob, filename, fireTrack]);

  const twitterIntent = `https://twitter.com/intent/tweet?text=${encodeURIComponent(
    `${text} — ${SHARE_TEXT}`,
  )}&url=${encodeURIComponent(url)}`;

  // ShareButton is "use client" and only mounts modalOpen=true after a
  // user click, so document is always defined here. Guard kept for the
  // SSR/RSC type checker.
  if (typeof document === "undefined") return null;

  const overlay = (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Share your result"
      onClick={(e) => {
        // Click on the backdrop (not on bubbled child content) closes.
        if (e.target === e.currentTarget) onClose();
      }}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 2147483000, // above absolutely everything
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
        className="w-full max-w-[560px] max-h-[92vh] overflow-auto border border-line bg-surface text-ink"
        style={{ borderRadius: 14 }}
      >
        <div className="flex items-center justify-between border-b border-line px-4 py-3">
          <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-info">
            Share your result
          </p>
          <button
            type="button"
            onClick={onClose}
            className="-mr-1 px-2 py-1 font-mono text-base leading-none text-ink-soft transition-colors hover:text-ink"
            aria-label="Close"
          >
            ×
          </button>
        </div>

        <div className="flex flex-col gap-5 px-5 py-5 sm:px-6 sm:py-6">
          {/* Image preview — scaled-down version of the actual capture.
              While the capture is in flight we show a placeholder of the
              same aspect ratio so the modal doesn't reflow when the image
              lands. */}
          <div
            className="relative mx-auto w-full max-w-sm overflow-hidden rounded-(--radius-card) border border-line bg-inset"
            style={{ aspectRatio: "1 / 1" }}
          >
            {previewUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={previewUrl}
                alt="Share preview"
                className="absolute inset-0 h-full w-full object-cover"
              />
            ) : captureError ? (
              <div className="absolute inset-0 flex items-center justify-center px-6 text-center font-mono text-[11px] uppercase tracking-[0.18em] text-wrong">
                Capture failed — try again
              </div>
            ) : (
              <div className="absolute inset-0 flex items-center justify-center font-mono text-[10px] uppercase tracking-[0.22em] text-ink-faint">
                Rendering…
              </div>
            )}
          </div>

          {/* Link readout — visible URL so the user can copy it manually
              if they prefer. Also makes it obvious *which* link will be
              shared. The accompanying button below copies it cleanly. */}
          <div className="flex items-center gap-2 rounded-(--radius-card) border border-line bg-inset/60 px-3 py-2">
            <code className="min-w-0 flex-1 truncate font-mono text-[12px] text-ink-soft">
              {url}
            </code>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <ActionButton
              onClick={handleCopyImage}
              disabled={!blob}
              confirmed={confirmed === "image"}
              label="Copy image + link"
              confirmedLabel="Copied"
              icon={<ImageGlyph />}
            />
            <ActionButton
              onClick={handleCopyLink}
              confirmed={confirmed === "link"}
              label="Copy link"
              confirmedLabel="Link copied"
              icon={<LinkGlyph />}
            />
            <ActionButton
              onClick={handleDownload}
              disabled={!blob}
              confirmed={confirmed === "download"}
              label="Download"
              confirmedLabel="Saved"
              icon={<DownloadGlyph />}
            />
            <a
              href={twitterIntent}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => fireTrack("twitter_intent")}
              className="group inline-flex items-center justify-center gap-2 rounded-(--radius-card) border border-line bg-inset/40 px-3 py-2.5 font-mono text-[11px] uppercase tracking-[0.18em] text-ink-soft transition-colors hover:border-info/60 hover:text-info"
            >
              <XGlyph />
              Share on X
            </a>
          </div>

          {captureError && (
            <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-wrong">
              {captureError}
            </p>
          )}

          <p className="font-mono text-[9px] leading-relaxed text-ink-faint">
            Tip: Copy image + link puts both on your clipboard. In
            Discord, iMessage, and most chats, paste attaches the image
            and types the link in one shot.
          </p>
        </div>
      </motion.div>

      {/* Offscreen capture surface. Same z context as the modal but
          translated off-canvas; modern-screenshot reads computed styles
          from the live DOM so it MUST be painted, not display:none. */}
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
    </div>
  );

  return createPortal(overlay, document.body);
}

function ActionButton({
  onClick,
  disabled,
  confirmed,
  label,
  confirmedLabel,
  icon,
}: {
  onClick: () => void;
  disabled?: boolean;
  confirmed: boolean;
  label: string;
  confirmedLabel: string;
  icon: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="group relative inline-flex items-center justify-center gap-2 overflow-hidden rounded-(--radius-card) border border-line bg-inset/40 px-3 py-2.5 font-mono text-[11px] uppercase tracking-[0.18em] text-ink-soft transition-colors hover:border-info/60 hover:text-info disabled:cursor-not-allowed disabled:opacity-50"
    >
      <span className="inline-flex items-center gap-2">
        {icon}
        <span>{label}</span>
      </span>
      <AnimatePresence>
        {confirmed && (
          <motion.span
            key="confirmed"
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.15 }}
            className="absolute inset-0 flex items-center justify-center gap-2 bg-info/15 text-info"
          >
            <CheckGlyph />
            <span>{confirmedLabel}</span>
          </motion.span>
        )}
      </AnimatePresence>
    </button>
  );
}

function ImageGlyph() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
      <rect
        x="3"
        y="5"
        width="18"
        height="14"
        rx="2"
        stroke="currentColor"
        strokeWidth="2"
      />
      <circle cx="9" cy="11" r="1.5" fill="currentColor" />
      <path
        d="M21 17l-5-5-9 9"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function LinkGlyph() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M10 14a3.5 3.5 0 0 1 0-5l3-3a3.5 3.5 0 1 1 5 5l-1.5 1.5M14 10a3.5 3.5 0 0 1 0 5l-3 3a3.5 3.5 0 1 1-5-5L7.5 11.5"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

function DownloadGlyph() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M12 4v12m0 0l-4-4m4 4l4-4M4 18v2h16v-2"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function XGlyph() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" aria-hidden>
      <path
        d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"
        fill="currentColor"
      />
    </svg>
  );
}

function CheckGlyph() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M5 12l5 5 9-11"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
