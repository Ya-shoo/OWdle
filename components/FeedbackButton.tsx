"use client";

// Feedback entry point. Posts to /api/feedback on the shared owdle-votes
// D1; the `source` column tags each row with 'owdle' so the inbox can be
// filtered per site.
//
// Placement is responsive:
// - Desktop (md+): floating pill bottom-right. Small by default; amplifies
//   to an accent-bordered "Got feedback?" pill once every mode is done.
// - Mobile: lives inline at the very bottom of body content by default so
//   it doesn't sit on top of the game UI. After any mode completion it
//   pops up as a sticky footer for ~10s, giving the player a one-tap
//   chance to leave a note while the experience is fresh. The same popup
//   fires on the final completion too.
//
// `feedback:refresh` is dispatched by NextModeCTA on every win. Same-tab
// in-app writes don't trigger the native `storage` event, so the custom
// event is what drives both the desktop amplification and the mobile
// popup.

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import clsx from "clsx";
import { BUILT_MODE_SLUGS } from "@/lib/modes";
import { loadModeState } from "@/lib/storage";
import { dayString } from "@/lib/daily";

const MAX_LEN = 150;
const POPUP_MS = 10000;
const REFRESH_EVENT = "feedback:refresh";

type Status = "idle" | "sending" | "sent" | "error" | "rate_limited";

function readAllDone(): boolean {
  if (typeof window === "undefined") return false;
  const day = dayString();
  for (const slug of BUILT_MODE_SLUGS) {
    const st = loadModeState(slug, day);
    // gaveUp counts here for the same reason NextModeCTA treats it as
    // done: the player has engaged with that mode and won't be looped
    // back through it, so we should consider them finished for the day.
    if (!st.won && !st.gaveUp) return false;
  }
  return true;
}

export function FeedbackButton() {
  // Map mode owns the bottom-right corner (minimap + submit button live
  // there during the guess phase). The floating pill moves to the
  // top-right on every /map and /labeler/map route so it stops blocking
  // the submit button. Other pages keep the default bottom-right anchor.
  const pathname = usePathname();
  const isMapRoute =
    pathname === "/map" ||
    pathname?.startsWith("/map/") === true ||
    pathname?.startsWith("/labeler/map") === true;

  const [open, setOpen] = useState(false);
  const [hasOpened, setHasOpened] = useState(false);
  const [text, setText] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [allDone, setAllDone] = useState(false);
  const [popupActive, setPopupActive] = useState(false);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Idle re-scans (focus, visibility) only refresh the allDone flag.
  // Completion events also flip the popup on, since the player has just
  // finished engaging with a mode and is the most receptive to giving
  // feedback at that moment.
  useEffect(() => {
    const refresh = () => setAllDone(readAllDone());
    refresh();
    const onCompletion = () => {
      setAllDone(readAllDone());
      setPopupActive(true);
    };
    const onVis = () => {
      if (document.visibilityState === "visible") refresh();
    };
    window.addEventListener(REFRESH_EVENT, onCompletion);
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", onVis);
    return () => {
      window.removeEventListener(REFRESH_EVENT, onCompletion);
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, []);

  // Auto-dismiss the mobile popup so the sticky footer doesn't outstay its
  // welcome. The timer resets every time popupActive flips on, so two
  // completions in quick succession extend the visible window.
  useEffect(() => {
    if (!popupActive) return;
    const id = setTimeout(() => setPopupActive(false), POPUP_MS);
    return () => clearTimeout(id);
  }, [popupActive]);

  useEffect(() => {
    const dlg = dialogRef.current;
    if (!dlg) return;
    if (open && !dlg.open) {
      dlg.showModal();
      setHasOpened(true);
      requestAnimationFrame(() => textareaRef.current?.focus());
    } else if (!open && dlg.open) {
      dlg.close();
    }
  }, [open]);

  useEffect(() => {
    if (open) {
      const prev = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      return () => {
        document.body.style.overflow = prev;
      };
    }
  }, [open]);

  const openDialog = () => {
    setOpen(true);
    setPopupActive(false);
  };

  const close = () => {
    setOpen(false);
    setStatus("idle");
  };

  const onBackdropClick = (e: React.MouseEvent<HTMLDialogElement>) => {
    if (e.target === dialogRef.current) close();
  };

  const trimmed = text.trim();
  const canSend = trimmed.length > 0 && trimmed.length <= MAX_LEN && status !== "sending";

  const submit = async () => {
    if (!canSend) return;
    setStatus("sending");
    try {
      const res = await fetch("/api/feedback", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ body: trimmed }),
      });
      if (res.ok) {
        setStatus("sent");
        setText("");
        setTimeout(() => {
          setOpen(false);
          setStatus("idle");
        }, 1400);
      } else if (res.status === 429) {
        setStatus("rate_limited");
      } else {
        setStatus("error");
      }
    } catch {
      setStatus("error");
    }
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault();
      void submit();
    }
  };

  return (
    <>
      {/* Desktop floating pill. Hidden on mobile (where the inline +
          sticky-popup pair handles things). Amplifies once every mode is
          done, since that's the moment the player has most to say. */}
      <button
        type="button"
        onClick={openDialog}
        aria-label={allDone ? "Send feedback. You finished every mode today" : "Send feedback"}
        className={clsx(
          "fixed z-40 hidden items-center gap-2 backdrop-blur-sm transition-all md:inline-flex md:right-5",
          isMapRoute ? "md:top-5" : "md:bottom-5",
          allDone
            ? "border-2 border-correct bg-correct/15 px-5 py-3 font-mono text-xs uppercase tracking-[0.22em] text-correct shadow-[0_0_28px_-6px_var(--correct,#7fdc92)] hover:bg-correct/25"
            : "border border-edge bg-surface/95 px-4 py-2.5 font-mono text-[11px] uppercase tracking-[0.22em] text-ink shadow-[0_4px_12px_rgba(0,0,0,0.35)] hover:border-info hover:text-info",
        )}
      >
        {allDone ? <PingDot /> : null}
        <SpeechMark />
        {allDone ? "Got feedback?" : "Feedback"}
      </button>

      {/* Mobile inline. Sits below the page footer as the last item in
          body so it's discoverable but doesn't cover game UI. */}
      <div className="flex justify-center px-4 py-6 md:hidden">
        <button
          type="button"
          onClick={openDialog}
          aria-label="Send feedback"
          className="inline-flex items-center gap-2 border border-edge bg-surface/90 px-4 py-2.5 font-mono text-[11px] uppercase tracking-[0.22em] text-ink-soft transition-colors hover:border-info hover:text-info"
        >
          <SpeechMark />
          Feedback
        </button>
      </div>

      {/* Mobile temporary sticky footer. Fires on every mode completion
          via the refresh event. Auto-dismisses after POPUP_MS or when the
          user taps the close X. Slides up so the appearance reads as a
          considered prompt, not a jolt. */}
      {popupActive ? (
        <div
          role="status"
          aria-live="polite"
          className="fixed inset-x-0 bottom-0 z-40 border-t border-correct/60 bg-surface/95 px-4 py-3 shadow-[0_-6px_24px_rgba(0,0,0,0.55)] backdrop-blur-sm md:hidden"
          style={{ animation: "fb-slide-up 260ms cubic-bezier(0.2, 0.8, 0.2, 1) both" }}
        >
          <div className="flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={openDialog}
              className="inline-flex flex-1 items-center justify-center gap-2 border border-correct bg-correct/15 px-4 py-2.5 font-mono text-[11px] uppercase tracking-[0.22em] text-correct"
            >
              <PingDot />
              <SpeechMark />
              Got feedback?
            </button>
            <button
              type="button"
              onClick={() => setPopupActive(false)}
              aria-label="Dismiss"
              className="shrink-0 p-2 font-mono text-base leading-none text-ink-soft transition-colors hover:text-ink"
            >
              ×
            </button>
          </div>
          <style>{`@keyframes fb-slide-up { from { transform: translateY(100%); opacity: 0; } to { transform: translateY(0); opacity: 1; } }`}</style>
        </div>
      ) : null}

      <dialog
        ref={dialogRef}
        onClose={close}
        onClick={onBackdropClick}
        className="m-auto w-[min(440px,92vw)] max-w-[92vw] border border-line bg-surface p-0 text-ink backdrop:bg-black/70 backdrop:backdrop-blur-sm"
      >
        <div className="flex items-center justify-between border-b border-line px-4 py-3">
          <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-info">
            Send feedback
          </p>
          <button
            type="button"
            onClick={close}
            className="-mr-1 px-2 py-1 font-mono text-base leading-none text-ink-soft transition-colors hover:text-ink"
            aria-label="Close"
          >
            ×
          </button>
        </div>

        {hasOpened ? (
          <div className="flex flex-col gap-3 p-4">
            <p className="text-sm text-ink-soft">
              Bug, idea, complaint, kind word. Whatever&apos;s on your mind, in
              150 characters or fewer.
            </p>

            <textarea
              ref={textareaRef}
              value={text}
              onChange={(e) => setText(e.target.value.slice(0, MAX_LEN))}
              onKeyDown={onKeyDown}
              maxLength={MAX_LEN}
              rows={4}
              disabled={status === "sending" || status === "sent"}
              placeholder="Type your feedback…"
              className="w-full resize-none border border-line bg-inset/60 p-3 font-sans text-sm text-ink placeholder:text-ink-faint focus:border-info focus:outline-none disabled:opacity-60"
            />

            <div className="flex items-center justify-between gap-3">
              <span
                className={`font-mono text-[10px] uppercase tracking-[0.22em] ${
                  status === "error" || status === "rate_limited"
                    ? "text-red-400"
                    : status === "sent"
                      ? "text-info"
                      : "text-ink-faint"
                }`}
              >
                {status === "sent"
                  ? "Sent, thanks"
                  : status === "rate_limited"
                    ? "Too many. Try tomorrow"
                    : status === "error"
                      ? "Send failed. Try again"
                      : `${trimmed.length}/${MAX_LEN}`}
              </span>
              <button
                type="button"
                onClick={submit}
                disabled={!canSend}
                className="border border-line bg-surface px-4 py-2 font-mono text-[10px] uppercase tracking-[0.22em] text-ink transition-colors hover:border-info hover:text-info disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-line disabled:hover:text-ink"
              >
                {status === "sending" ? "Sending…" : "Send"}
              </button>
            </div>
          </div>
        ) : null}
      </dialog>
    </>
  );
}

function SpeechMark() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" aria-hidden>
      <path
        d="M4 4h16v12H7l-3 3z"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function PingDot() {
  return (
    <span aria-hidden className="relative inline-flex h-2 w-2 shrink-0">
      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-correct opacity-70" />
      <span className="relative inline-flex h-2 w-2 rounded-full bg-correct" />
    </span>
  );
}
