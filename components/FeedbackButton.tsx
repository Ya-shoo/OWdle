"use client";

// Floating bottom-right feedback pill that opens a native <dialog> with a
// short (150 char) free-form textarea. Posts to /api/feedback on the
// shared owdle-votes D1; the `source` column tags each row with 'owdle'
// so the inbox can be filtered per site.
//
// The pill has two visual states: a discoverable but contained default,
// and an amplified state once the player has cleared every mode for the
// day. The amplified state is the moment they're most likely to have an
// opinion worth typing, so we make the ask a bit louder then.

import { useEffect, useRef, useState } from "react";
import { BUILT_MODE_SLUGS } from "@/lib/modes";
import { loadModeState } from "@/lib/storage";
import { dayString } from "@/lib/daily";

const MAX_LEN = 150;

type Status = "idle" | "sending" | "sent" | "error" | "rate_limited";

const REFRESH_EVENT = "feedback:refresh";

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
  const [open, setOpen] = useState(false);
  const [hasOpened, setHasOpened] = useState(false);
  const [text, setText] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [allDone, setAllDone] = useState(false);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Re-scan localStorage on mount, on tab visibility return, and when a
  // game-side component fires the refresh event. Same-tab in-app writes
  // don't trigger the native `storage` event, so we rely on the custom
  // event for instant in-session transitions.
  useEffect(() => {
    const refresh = () => setAllDone(readAllDone());
    refresh();
    const onVis = () => {
      if (document.visibilityState === "visible") refresh();
    };
    window.addEventListener(REFRESH_EVENT, refresh);
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", onVis);
    return () => {
      window.removeEventListener(REFRESH_EVENT, refresh);
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, []);

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

  const triggerClass = allDone
    ? "fixed bottom-4 right-4 z-40 inline-flex items-center gap-2 border-2 border-correct bg-correct/15 px-5 py-3 font-mono text-xs uppercase tracking-[0.22em] text-correct shadow-[0_0_28px_-6px_var(--correct,#7fdc92)] backdrop-blur-sm transition-all hover:bg-correct/25 sm:bottom-5 sm:right-5"
    : "fixed bottom-4 right-4 z-40 inline-flex items-center gap-2 border border-edge bg-surface/95 px-4 py-2.5 font-mono text-[11px] uppercase tracking-[0.22em] text-ink shadow-[0_4px_12px_rgba(0,0,0,0.35)] backdrop-blur-sm transition-all hover:border-info hover:text-info sm:bottom-5 sm:right-5";

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={allDone ? "Send feedback. You finished every mode today" : "Send feedback"}
        className={triggerClass}
      >
        {allDone ? (
          <span aria-hidden className="relative inline-flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-correct opacity-70" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-correct" />
          </span>
        ) : null}
        <SpeechMark />
        {allDone ? "Got feedback?" : "Feedback"}
      </button>

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
