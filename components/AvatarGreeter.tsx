"use client";

// Home-page mascot with an idle ⇄ active state machine.
//
//   • On load (and on every hover/tap after it has idled) the waving-avatar
//     video pops into the corner, plays its greeting ONCE, and the
//     announcement bubble (lib/greeter.ts) fades in beside it.
//   • A few seconds after the wave finishes, the whole mascot animates out
//     and collapses to a small "•••" speech bubble left in the corner.
//   • Clicking / tapping the mascot at any point (even mid-wave) quick-
//     dismisses it straight back to that bubble.
//   • Hovering / focusing / tapping that bubble replays the whole thing.
//
// Re-hover is debounced against playback: a hover only (re)starts the wave
// when it isn't already playing, so jittering the cursor over the mascot
// can't restart it mid-wave — it has to play through first.
//
// The collapse is timer-driven, NOT hung off the video's `ended` event:
// `autoPlay` starts at parse time but React's non-bubbling `onEnded` only
// binds at hydration, so on a heavy page the short clip can finish before
// the listener exists and the event is missed. Instead we drive playback
// ourselves and start a collapse timer sized to the clip's real duration
// (read from onLoadedMetadata); `onEnded` is kept only as a fast-path.
//
// The clip is the source render, scaled + transcoded to mp4/webm (see
// public/greeter/ + scripts/build-greeter-video.sh) — a linear one-shot,
// never looped. Entrance/exit are transition-driven so the same motion
// works both directions; reduced-motion visitors get the static poster.

import { useEffect, useRef, useState } from "react";
import type { GreeterAnnouncement } from "@/lib/greeter";
import { GreeterPoll } from "./GreeterPoll";

const POSTER = "/greeter/wave-poster.jpg";
const INTRO_DELAY_MS = 400; // bubble fades in alongside the pop-in / wave
const IDLE_AFTER_MS = 5000; // collapse this long after the wave finishes
const DEFAULT_WAVE_MS = 2800; // fallback clip length until metadata loads
const SEEN_PREFIX = "owdle:greeter-seen:"; // localStorage key per announcement id

export function AvatarGreeter({
  announcement,
  apiBase = "",
}: {
  announcement?: GreeterAnnouncement | null;
  apiBase?: string;
}) {
  const [reduced, setReduced] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [minimized, setMinimized] = useState(false);
  const [bubbleReady, setBubbleReady] = useState(false);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const playingRef = useRef(false);
  const hoveredRef = useRef(false);
  const waveMsRef = useRef(DEFAULT_WAVE_MS);
  const playTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const idleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const suppressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const suppressRef = useRef(false);
  const seenAtMountRef = useRef<boolean | null>(null);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(mq.matches);
    const on = () => setReduced(mq.matches);
    mq.addEventListener?.("change", on);
    return () => mq.removeEventListener?.("change", on);
  }, []);

  const clearTimer = (t: React.MutableRefObject<ReturnType<typeof setTimeout> | null>) => {
    if (t.current) {
      clearTimeout(t.current);
      t.current = null;
    }
  };

  // Remember that this announcement has been shown — so it won't auto-pop
  // again on later pages (e.g. Classic) or reloads until the id changes.
  const markSeen = () => {
    if (!announcement) return;
    try {
      localStorage.setItem(SEEN_PREFIX + announcement.id, "1");
    } catch {
      /* storage blocked — nothing to persist */
    }
  };

  // Collapse to the speech bubble — but only once the wave is done and
  // nobody's hovering.
  const scheduleIdle = () => {
    clearTimer(idleTimer);
    if (!announcement) return; // nothing to collapse into — stay put
    if (hoveredRef.current || playingRef.current) return;
    idleTimer.current = setTimeout(() => setMinimized(true), IDLE_AFTER_MS);
  };

  // The wave has finished playing through (timer or `ended`, whichever first).
  const finishWave = () => {
    clearTimer(playTimer);
    if (!playingRef.current) return; // already finished — stay idempotent
    playingRef.current = false;
    scheduleIdle();
  };

  // Restore the mascot and play the wave from the top, then arm the collapse
  // timer off the clip's real length.
  const startWave = () => {
    clearTimer(idleTimer);
    setMinimized(false);
    const v = videoRef.current;
    if (reduced || !v) {
      // No wave to wait on — just let the announcement sit, then collapse.
      playingRef.current = false;
      scheduleIdle();
      return;
    }
    playingRef.current = true;
    v.currentTime = 0;
    v.play().catch(() => {});
    clearTimer(playTimer);
    playTimer.current = setTimeout(finishWave, waveMsRef.current + 150);
  };

  // A hover wakes the mascot — but the re-hover guard means it only (re)starts
  // the wave when it isn't already mid-wave.
  const wake = () => {
    if (playingRef.current) {
      clearTimer(idleTimer);
      setMinimized(false);
      return;
    }
    startWave();
  };
  const enter = () => {
    hoveredRef.current = true;
    wake();
  };
  const leave = () => {
    hoveredRef.current = false;
    scheduleIdle();
  };

  // Click the mascot at any point → quick-dismiss straight back to the bubble
  // (works mid-wave too). Briefly suppress hover-reopen so the chip appearing
  // under the cursor doesn't immediately bounce back to the mascot.
  const dismiss = () => {
    clearTimer(playTimer);
    clearTimer(idleTimer);
    playingRef.current = false;
    const v = videoRef.current;
    if (v) {
      v.pause();
      v.currentTime = 0;
    }
    suppressRef.current = true;
    clearTimer(suppressTimer);
    suppressTimer.current = setTimeout(() => {
      suppressRef.current = false;
    }, 450);
    setMinimized(true);
  };

  // Idle-chip hover/focus reopens — unless a just-clicked dismiss is still
  // suppressed. A click on the chip always reopens.
  const idleEnter = () => {
    if (suppressRef.current) return;
    hoveredRef.current = true;
    wake();
  };
  const reopen = () => {
    clearTimer(suppressTimer);
    suppressRef.current = false;
    hoveredRef.current = true;
    wake();
  };

  // First-load entrance: reveal (triggers the pop-in transition) and stage
  // the bubble a beat later.
  useEffect(() => {
    const raf = requestAnimationFrame(() => setMounted(true));
    const introT = setTimeout(() => setBubbleReady(true), INTRO_DELAY_MS);
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(introT);
      clearTimer(playTimer);
      clearTimer(idleTimer);
      clearTimer(suppressTimer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Kick off once we know whether motion is reduced: greet on the first
  // encounter with this announcement, but if it's already been shown /
  // dismissed before, start collapsed as the chip so it doesn't pop open
  // again (e.g. arriving on Classic after seeing it on Home). The seen value
  // is cached in a ref so React StrictMode's double-invoke doesn't read back
  // the flag we just wrote and suppress the greeting.
  useEffect(() => {
    if (seenAtMountRef.current === null) {
      let seen = false;
      if (announcement) {
        try {
          seen = localStorage.getItem(SEEN_PREFIX + announcement.id) === "1";
        } catch {
          /* storage blocked — treat as unseen */
        }
      }
      seenAtMountRef.current = seen;
    }
    if (seenAtMountRef.current) {
      setMinimized(true); // already seen — just show the chip, no auto-pop
      return;
    }
    markSeen(); // remember we've now shown it
    startWave();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reduced]);

  const mascotShown = mounted && !minimized;
  const bubbleShown = mounted && !minimized && bubbleReady && !!announcement;

  const frameClass =
    "h-28 w-28 rounded-[2rem] object-cover shadow-[0_14px_34px_-8px_rgba(0,0,0,0.6)]";

  return (
    <div className="pointer-events-none relative">
      {/* mascot — pops in / animates out via transition (spring easing) */}
      <button
        type="button"
        onMouseEnter={enter}
        onMouseLeave={leave}
        onFocus={enter}
        onBlur={leave}
        onClick={dismiss}
        tabIndex={mascotShown ? 0 : -1}
        aria-hidden={!mascotShown}
        aria-label="Site mascot: replay the wave and show the latest update"
        className={`block origin-top-right rounded-[2rem] outline-none transition duration-500 ease-[cubic-bezier(0.34,1.56,0.64,1)] focus-visible:ring-2 focus-visible:ring-accent ${
          mascotShown
            ? "pointer-events-auto translate-x-0 translate-y-0 scale-100 opacity-100"
            : "pointer-events-none translate-x-5 translate-y-5 scale-50 opacity-0"
        }`}
      >
        {reduced ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={POSTER} alt="" width={112} height={112} className={frameClass} />
        ) : (
          <video
            ref={videoRef}
            className={frameClass}
            width={112}
            height={112}
            muted
            playsInline
            preload="auto"
            poster={POSTER}
            aria-hidden
            onLoadedMetadata={(e) => {
              const d = e.currentTarget.duration;
              if (d && Number.isFinite(d)) waveMsRef.current = d * 1000;
            }}
            onEnded={finishWave}
          >
            <source src="/greeter/wave.webm" type="video/webm" />
            <source src="/greeter/wave.mp4" type="video/mp4" />
          </video>
        )}
      </button>

      {/* announcement bubble — to the mascot's top-left */}
      {announcement && (
        <div
          role="status"
          aria-hidden={!bubbleShown}
          className={`pointer-events-none absolute right-full top-0 mr-3 w-52 rounded-2xl border border-line bg-ink px-3.5 py-3 text-left font-soft text-canvas shadow-[0_14px_30px_-10px_rgba(0,0,0,0.5)] transition duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] ${
            bubbleShown ? "translate-x-0 opacity-100" : "translate-x-2 opacity-0"
          }`}
        >
          {announcement.title && (
            <p className="text-xs font-bold leading-tight">{announcement.title}</p>
          )}
          <div className="mt-0.5 whitespace-pre-line text-xs leading-snug text-canvas/85">
            {announcement.body}
          </div>
          {announcement.poll && announcement.poll.options.length > 0 && (
            <GreeterPoll
              pollId={announcement.poll.id ?? announcement.id}
              options={announcement.poll.options}
              apiBase={apiBase}
            />
          )}
          <span
            aria-hidden
            className="absolute left-full top-3 h-3 w-3 -translate-x-1.5 rotate-45 rounded-[2px] border-r border-t border-line bg-ink"
          />
        </div>
      )}

      {/* idle speech bubble — all that's left once the mascot tucks away */}
      {announcement && (
        <button
          type="button"
          onMouseEnter={idleEnter}
          onMouseLeave={leave}
          onFocus={idleEnter}
          onBlur={leave}
          onClick={reopen}
          tabIndex={minimized ? 0 : -1}
          aria-hidden={!minimized}
          aria-label="Show the mascot and the latest update"
          className={`absolute right-3 top-3 flex items-center gap-1 rounded-full border border-line bg-ink px-3.5 py-3 shadow-[0_10px_24px_-8px_rgba(0,0,0,0.55)] outline-none transition-opacity duration-300 focus-visible:ring-2 focus-visible:ring-accent ${
            minimized
              ? "greeter-chip-bob pointer-events-auto opacity-100"
              : "pointer-events-none opacity-0"
          }`}
        >
          <span
            className="greeter-typing-dot h-1.5 w-1.5 rounded-full bg-canvas"
            style={{ animationDelay: "0ms" }}
          />
          <span
            className="greeter-typing-dot h-1.5 w-1.5 rounded-full bg-canvas"
            style={{ animationDelay: "150ms" }}
          />
          <span
            className="greeter-typing-dot h-1.5 w-1.5 rounded-full bg-canvas"
            style={{ animationDelay: "300ms" }}
          />
          <span
            aria-hidden
            className="absolute right-3 top-full h-2.5 w-2.5 -translate-y-1.5 rotate-45 rounded-[2px] border-b border-r border-line bg-ink"
          />
        </button>
      )}
    </div>
  );
}
