"use client";

import { ReactNode, useCallback, useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { createPortal } from "react-dom";
import { captureNodePng } from "@/lib/share-image";
import { ogPreviewSrc, ogRetrySrc } from "@/lib/shareLinks";
import { trackShareClicked } from "@/lib/tracking";
import type { ModeSlug } from "@/lib/modes";

// Slim share modal, link-first. One primary action — Copy link — plus a
// quiet Download of the card image.
//
// The preview is the ACTUAL /og/r/[code] image the unfurlers will
// fetch, not a client-side imitation: truthful by construction, zero
// drift risk between "what the modal shows" and "what friends see".
// (The old flow previewed a client-captured card and then copied a
// multi-mime ClipboardItem — which platforms never honored: paste
// targets pick exactly one clipboard flavor and silently drop the
// text. The link-unfurl model replaces that whole dead end.)
//
// Surfaces without a personalized unfurl (streak rank) pass renderCard
// instead of ogImageUrl; the modal captures the client card for both
// preview and Download there.
//
// PostHog: each action fires share_clicked with a precise method tag —
// "clipboard-link" | "download".

type Props = {
  renderCard?: () => ReactNode;
  url: string;
  ogImageUrl?: string;
  filename: string;
  surface: "round_result" | "daily_complete" | "streak_rank";
  mode?: ModeSlug;
  dailyId: string;
  onClose: () => void;
};

export function ShareModal({
  renderCard,
  url,
  ogImageUrl,
  filename,
  surface,
  mode,
  dailyId,
  onClose,
}: Props) {
  const cardRef = useRef<HTMLDivElement>(null);
  // Captured PNG of the client card — only for no-OG surfaces (streak
  // rank), where it backs both the preview and Download.
  const blobRef = useRef<Blob | null>(null);
  const [fallbackPreviewUrl, setFallbackPreviewUrl] = useState<string | null>(
    null,
  );
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  // Preview attempt counter — a failed/stalled OG load retries up to
  // three times (fresh <img> via key) before the final "unavailable"
  // copy. Cold renders can 503 transiently (free-plan CPU limits; the
  // error is no-store so a refetch self-heals) — a single-shot <img>
  // turned those into a dead preview even though the very next request
  // would have succeeded. Each retry fetches a DISTINCT URL
  // (ogRetrySrc) — WebKit replays a same-URL failure from its memory
  // cache, which silently defeated the whole ladder on iOS. The
  // client-captured fallback path never retries.
  const [previewTry, setPreviewTry] = useState(0);
  const retryTimer = useRef<number | null>(null);
  const [downloadBusy, setDownloadBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState<"link" | "download" | null>(null);

  // Shared with ShareButton's result-mount prefetch — identical URL,
  // identical cache key, so the prefetched render is the one shown.
  const ogSrc = ogImageUrl ? ogPreviewSrc(ogImageUrl) : null;

  const ogStatus: "loading" | "ready" | "error" | "none" = !ogSrc
    ? "none"
    : loaded
      ? "ready"
      : failed
        ? "error"
        : "loading";

  // Lock background scroll + wire Esc-to-close. Portal target is
  // document.body — the modal must escape stacking contexts from the
  // result card's transform/opacity wrappers.
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

  // No-OG fallback (streak rank): capture the offscreen card once it's
  // painted and use it as the preview. Two animation frames guarantee
  // webfont layout + image decode have completed.
  useEffect(() => {
    if (ogImageUrl || !renderCard) return;
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
          blobRef.current = b;
          createdUrl = URL.createObjectURL(b);
          setFallbackPreviewUrl(createdUrl);
        } catch {
          if (cancelled) return;
          setActionError("Preview failed. Copy link still works.");
        }
      });
    });
    return () => {
      cancelled = true;
      window.cancelAnimationFrame(id);
      if (createdUrl) URL.revokeObjectURL(createdUrl);
    };
  }, [ogImageUrl, renderCard]);

  // Auto-clear the confirmation chip a beat after each action so a second
  // click on the same button feels responsive (not stuck on the prior ✓).
  useEffect(() => {
    if (confirmed == null) return;
    const id = window.setTimeout(() => setConfirmed(null), 1600);
    return () => window.clearTimeout(id);
  }, [confirmed]);

  const handlePreviewError = useCallback(() => {
    // Only the server-rendered OG path retries — the client-captured
    // fallback (blob URL) failing again deterministically. Backoff
    // grows per attempt (1.8s/3.6s/5.4s): instant 503s otherwise burn
    // the ladder in seconds, and the later spacing honors the
    // function's retry-after: 5 while giving the platform time to
    // route off the cold isolate.
    if (ogSrc && previewTry < 3) {
      retryTimer.current = window.setTimeout(
        () => {
          setPreviewTry((t) => t + 1);
        },
        1800 * (previewTry + 1),
      );
    } else {
      setFailed(true);
    }
  }, [ogSrc, previewTry]);

  useEffect(
    () => () => {
      if (retryTimer.current != null) {
        window.clearTimeout(retryTimer.current);
      }
    },
    [],
  );

  // Stall guard for the OG preview: if an attempt neither loads nor
  // errors within 8s (hot-reload races in dev, flaky networks in prod),
  // route it through the same retry path as an explicit error instead
  // of pinning "Rendering preview…" forever. Copy link never depended
  // on it.
  useEffect(() => {
    if (!ogSrc || ogStatus !== "loading") return;
    const id = window.setTimeout(handlePreviewError, 8000);
    return () => window.clearTimeout(id);
  }, [ogSrc, ogStatus, previewTry, handlePreviewError]);

  const handleCopyLink = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(url);
      setConfirmed("link");
      trackShareClicked({ surface, method: "clipboard-link", dailyId, mode });
    } catch (err) {
      setActionError(
        err instanceof Error ? err.message : "Couldn't copy link.",
      );
      trackShareClicked({ surface, method: "error", dailyId, mode });
    }
  }, [url, surface, mode, dailyId]);

  const handleDownload = useCallback(async () => {
    if (downloadBusy) return;
    setDownloadBusy(true);
    try {
      let blob: Blob;
      if (ogSrc) {
        // Save the card image itself — exactly what the link unfurls.
        const res = await fetch(ogSrc);
        if (!res.ok) throw new Error("Couldn't fetch the card image.");
        blob = await res.blob();
      } else {
        // No-OG surface: capture the client card.
        if (!blobRef.current) {
          const node = cardRef.current;
          if (!node) return;
          blobRef.current = await captureNodePng(node);
        }
        blob = blobRef.current;
      }
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
      trackShareClicked({ surface, method: "download", dailyId, mode });
    } catch (err) {
      setActionError(
        err instanceof Error ? err.message : "Couldn't fetch the image.",
      );
      trackShareClicked({ surface, method: "error", dailyId, mode });
    } finally {
      setDownloadBusy(false);
    }
  }, [downloadBusy, ogSrc, filename, surface, mode, dailyId]);

  // ShareButton is "use client" and only mounts modalOpen=true after a
  // user click, so document is always defined here. Guard kept for the
  // SSR/RSC type checker.
  if (typeof document === "undefined") return null;

  // OG previews fetch the per-attempt URL — retries MUST differ from
  // the failed attempt's URL or WebKit serves the failure from cache
  // (see ogRetrySrc). Attempt 0 matches the prefetch's canonical URL.
  const previewSrc = ogImageUrl
    ? ogRetrySrc(ogImageUrl, previewTry)
    : fallbackPreviewUrl;

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
        className="w-full max-w-[480px] max-h-[92vh] overflow-auto border border-line bg-surface text-ink"
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

        <div className="flex flex-col gap-4 px-5 py-5 sm:px-6 sm:py-6">
          {/* Preview — the exact image the link unfurls into. Fixed 1:1
              box so the modal doesn't reflow when the image lands. The
              placeholder chrome (border + inset fill) only paints while
              there's nothing to show: once the image is up the box goes
              fully transparent so transparent-cornered cards read as
              true edges. */}
          <div
            className={
              "relative mx-auto w-full max-w-sm overflow-hidden rounded-(--radius-card)" +
              (ogStatus === "ready" || (!ogSrc && fallbackPreviewUrl)
                ? ""
                : " border border-line bg-inset")
            }
            style={{ aspectRatio: "1 / 1" }}
          >
            {/* Unmount the img on error — leaving it painted the
                browser's broken-image glyph behind the fallback text. */}
            {previewSrc && ogStatus !== "error" ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                key={previewTry}
                src={previewSrc}
                alt="Share preview"
                onLoad={() => setLoaded(true)}
                onError={handlePreviewError}
                className="absolute inset-0 h-full w-full object-cover"
              />
            ) : null}
            {ogStatus === "loading" && (
              <div className="absolute inset-0 flex items-center justify-center font-mono text-[10px] uppercase tracking-[0.22em] text-ink-faint">
                Rendering preview…
              </div>
            )}
            {(ogStatus === "error" ||
              (ogStatus === "none" && !fallbackPreviewUrl)) && (
              <div className="absolute inset-0 flex items-center justify-center px-6 text-center font-mono text-[10px] uppercase tracking-[0.18em] text-ink-faint">
                {ogStatus === "error"
                  ? "Preview unavailable. The link still unfurls when pasted"
                  : "Rendering…"}
              </div>
            )}
          </div>

          {/* Link readout — shows exactly what lands on the clipboard. */}
          <div className="flex items-center gap-2 rounded-(--radius-card) border border-line bg-inset/60 px-3 py-2">
            <code className="min-w-0 flex-1 truncate font-mono text-[12px] text-ink-soft">
              {url}
            </code>
          </div>

          {/* THE action. Everything else is a footnote. */}
          <button
            type="button"
            onClick={handleCopyLink}
            className="group relative inline-flex w-full items-center justify-center gap-2 overflow-hidden rounded-full bg-info px-5 py-3.5 text-on-info shadow-[0_2px_6px_-1px_rgba(0,0,0,0.3),0_0_4px_-1px_var(--info)] transition-all duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] hover:brightness-110 active:scale-[0.99]"
          >
            <span className="inline-flex items-center gap-2 font-mono text-[12px] uppercase tracking-[0.22em]">
              <LinkGlyph />
              Copy link
            </span>
            <AnimatePresence>
              {confirmed === "link" && (
                <motion.span
                  key="confirmed"
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -4 }}
                  transition={{ duration: 0.15 }}
                  className="absolute inset-0 flex items-center justify-center gap-2 bg-info font-mono text-[12px] uppercase tracking-[0.22em]"
                >
                  <CheckGlyph />
                  Link copied
                </motion.span>
              )}
            </AnimatePresence>
          </button>

          {/* Quiet escape hatch for places links don't unfurl (Instagram
              stories, print-your-fridge). Saves the card image itself. */}
          <button
            type="button"
            onClick={handleDownload}
            disabled={downloadBusy}
            className="relative mx-auto inline-flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.2em] text-ink-faint transition-colors hover:text-info disabled:opacity-50"
          >
            <DownloadGlyph />
            {confirmed === "download"
              ? "Saved"
              : downloadBusy
                ? "Fetching…"
                : "Download image"}
          </button>

          {actionError && (
            <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-wrong">
              {actionError}
            </p>
          )}

        </div>
      </motion.div>

      {/* Offscreen capture surface for no-OG surfaces. Same z context
          as the modal but translated off-canvas; modern-screenshot
          reads computed styles from the live DOM so it MUST be painted,
          not display:none. */}
      {renderCard && !ogImageUrl && (
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
      )}
    </div>
  );

  return createPortal(overlay, document.body);
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
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden>
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
