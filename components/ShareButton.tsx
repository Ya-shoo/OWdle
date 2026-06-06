"use client";

import {
  ReactNode,
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { ogRetrySrc } from "@/lib/shareLinks";
import { trackShareClicked } from "@/lib/tracking";
import type { ModeSlug } from "@/lib/modes";
import { ShareModal } from "./ShareModal";

// Share affordance, link-first. The /r/[code] link IS the share: it
// unfurls into the spray result card wherever it lands (Discord,
// iMessage, Slack, X, WhatsApp...). Two paths:
//
//   1. **Touch-primary devices** (phones, tablets) — navigator.share
//      with JUST the url. No file attach: iOS share targets that accept
//      files routinely drop the url/text members on the floor (the
//      mobile cousin of the desktop multi-mime clipboard failure), and
//      bare-url messages are also the only form iMessage unfurls. A
//      small companion icon button opens the modal so mobile users keep
//      a path to the preview + image Download.
//
//   2. **Pointer-primary devices** (desktop, laptop) — open ShareModal:
//      live preview of the actual unfurl image + one Copy-link action +
//      a quiet Download.
//
// The split is gated by touch capability + UA (see prefersNativeShare)
// — touch laptops still get the modal, iPad with magic keyboard still
// gets native share, which matches what each device actually does best.

type Props = {
  // Render function for a client-captured card. Only used by surfaces
  // WITHOUT a server-rendered unfurl image (streak rank) — there the
  // modal captures it for both preview and Download. Surfaces with an
  // ogImageUrl preview/download the server image itself.
  renderCard?: () => ReactNode;
  // Bare share link — goes on the clipboard / into the OS sheet as-is.
  url: string;
  // The /og/r/[code] image matching `url`. When present the modal
  // previews it (truthful by construction — it IS what friends see).
  ogImageUrl?: string;
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
  ogImageUrl,
  filename,
  surface,
  mode,
  dailyId,
  variant = "primary",
  label = "Share",
}: Props) {
  const [modalOpen, setModalOpen] = useState(false);
  // Whether this device takes the native-share path — decides if the
  // companion preview icon renders. useSyncExternalStore (no-op
  // subscribe; capability never changes mid-session) gives us the
  // hydration-safe server=false → client=detected flip without a
  // setState-in-effect render cascade.
  const nativeCapable = useSyncExternalStore(
    subscribeNever,
    prefersNativeShare,
    () => false,
  );
  // Latched guard against the double-click race where the user fires
  // onClick twice before the share sheet takes focus.
  const inFlightRef = useRef(false);

  // Pre-render the unfurl card the moment the result exists. Fetching
  // /og/r/[code] now means (a) the modal preview is instant instead of
  // "Rendering…", and (b) in production the EDGE cache is warm before
  // the link is ever pasted, so recipients' unfurlers hit a hot path
  // too. Short delay keeps it off the result-reveal animation's back;
  // data-saver connections skip it (the modal still renders on
  // demand).
  useEffect(() => {
    if (!ogImageUrl) return;
    const conn = (
      navigator as Navigator & { connection?: { saveData?: boolean } }
    ).connection;
    if (conn?.saveData) return;
    const id = window.setTimeout(() => {
      prefetchImage(ogImageUrl);
    }, 800);
    return () => window.clearTimeout(id);
  }, [ogImageUrl]);

  const handleClick = useCallback(async () => {
    if (inFlightRef.current) return;
    inFlightRef.current = true;
    try {
      // Touch-primary devices get the OS share sheet with the bare
      // link. "Shared" and "canceled" both end the flow; only a genuine
      // failure (some webviews advertise navigator.share then reject)
      // bumps to the modal so the user still has an explicit path.
      if (prefersNativeShare()) {
        try {
          await navigator.share({ url });
          trackShareClicked({ surface, method: "native", dailyId, mode });
          return;
        } catch (err) {
          if (err instanceof DOMException && err.name === "AbortError") {
            trackShareClicked({ surface, method: "canceled", dailyId, mode });
            return;
          }
          // fall through to the modal
        }
      }

      // Desktop / pointer-primary OR mobile-native fell through. The
      // modal fires its own PostHog events (one per action).
      setModalOpen(true);
    } finally {
      inFlightRef.current = false;
    }
  }, [url, surface, mode, dailyId]);

  // Both variants are SOLID fills — the earlier translucent tint washed
  // out against the result-card backgrounds. Primary mirrors the accent
  // pill's weight in info blue; soft is a solid muted chip for quieter
  // hosts (home hero).
  const btnClass =
    variant === "primary"
      ? "group inline-flex items-center gap-2 rounded-full bg-info px-5 py-3 text-on-info shadow-[0_2px_6px_-1px_rgba(0,0,0,0.3),0_0_4px_-1px_var(--info)] transition-all duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] hover:scale-[1.05] hover:brightness-110 hover:shadow-[0_3px_8px_-2px_rgba(0,0,0,0.4),0_0_6px_-2px_var(--info)] active:scale-[0.98] disabled:opacity-50"
      : "group inline-flex items-center gap-2 rounded-full border border-edge bg-muted px-4 py-2 text-ink transition-all hover:border-info hover:text-info active:scale-[0.98] disabled:opacity-50";

  return (
    <>
      <button
        type="button"
        onClick={handleClick}
        aria-label={label}
        className={btnClass}
      >
        <ShareGlyph />
        <span className="font-mono text-[11px] uppercase tracking-[0.22em]">
          {label}
        </span>
      </button>

      {/* Companion affordance for the native-share path: the OS sheet
          carries the link, so mobile users need a separate door to the
          preview + image Download. Desktop never shows it — the main
          button already opens the modal there. */}
      {nativeCapable && (
        <button
          type="button"
          onClick={() => setModalOpen(true)}
          aria-label="Preview card or save image"
          className="inline-flex items-center justify-center rounded-full border border-edge bg-muted p-3 text-ink-soft transition-all hover:border-info hover:text-info active:scale-[0.98]"
        >
          <ImageGlyph />
        </button>
      )}

      {modalOpen && (
        <ShareModal
          renderCard={renderCard}
          url={url}
          ogImageUrl={ogImageUrl}
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

// Device share capability is fixed for the session — no store to
// subscribe to.
function subscribeNever(): () => void {
  return () => {};
}

// Session-level prefetch dedupe — result cards re-mount (navigation,
// StrictMode), and each OG render is sizable; one warm per URL is
// plenty.
const PREFETCHED = new Set<string>();

// The prefetch RETRIES failed loads: the sharer's device is what pays
// the one cold wasm render each code ever needs (successes persist
// server-side in R2), so it must shoulder transient cold-isolate 503s
// — a give-up-on-first-error prefetch left the link un-warmed exactly
// when warming mattered most. Each retry fetches a DISTINCT URL
// (ogRetrySrc): WebKit replays a same-URL image failure from its
// memory cache without re-requesting, which made retries a no-op on
// iOS — precisely the devices whose native-share path depends on this
// prefetch alone to warm the link for unfurlers. Daily-summary codes
// are per-player unique (never prewarmed by the round-code cron), so
// they always run this gauntlet; four attempts at ~50% cold-kill odds
// leave a code un-warmed ~6% of the time, and the modal's own ladder
// picks up from there.
function prefetchImage(url: string, attempt = 0): void {
  if (!url) return;
  if (attempt === 0) {
    if (PREFETCHED.has(url)) return;
    PREFETCHED.add(url);
  }
  const img = new Image();
  img.decoding = "async";
  if (attempt < 3) {
    img.onerror = () => {
      window.setTimeout(() => prefetchImage(url, attempt + 1), 2500);
    };
  }
  img.src = ogRetrySrc(url, attempt);
}

// Whether to route this share through the OS share sheet vs. the modal.
// Touch-primary devices answer "yes" — that's where the sheet is the
// idiomatic share surface. Desktop platforms (including Mac Safari) all
// get the modal: a desktop "share" click means copy, not an OS sheet.
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
