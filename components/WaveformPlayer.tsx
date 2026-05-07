"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import {
  DEFAULT_VOLUME,
  gainFromVolume,
  loadVolume,
  saveVolume,
} from "@/lib/audio";
import { VolumeSlider } from "./VolumeSlider";

type Props = {
  audioUrl: string;
  // Seconds of audio that should currently be playable. The corresponding
  // portion of the waveform is rendered in the accent color; the remainder
  // is dimmed to tease the player with how much is still locked.
  revealDuration: number;
  // Multiplier applied to the master gain on top of the user's volume.
  // Used to compensate for support ability sounds being mastered quieter
  // than damage/tank ones in-game (see ROLE_AUDIO_BOOST). Defaults to 1.
  boost?: number;
};

const BAR_COUNT = 96;
const BAR_WIDTH = 3;
const BAR_GAP = 2;
const VIEW_WIDTH = BAR_COUNT * (BAR_WIDTH + BAR_GAP) - BAR_GAP;
const VIEW_HEIGHT = 96;
const CENTER_Y = VIEW_HEIGHT / 2;
const MAX_AMPL = VIEW_HEIGHT / 2 - 4;
const MIN_AMPL = 2;

// Anything quieter than this counts as silence at the head of the file.
// ~ -40 dBFS — quiet enough to skip MP3 encoder priming and any pre-roll
// the labeler left in front of the ability sound, loud enough that we
// won't eat into a soft attack.
const SILENCE_THRESHOLD = 0.01;
// Don't bother offsetting for sub-ms detected silence — below the
// threshold of perception and not worth the bookkeeping.
const MIN_SKIP_SECONDS = 0.005;
// Cap on how much head we'll trim. Defensive against an unusually quiet
// attack that we'd otherwise cut into.
const MAX_SKIP_SECONDS = 0.25;

export function WaveformPlayer({
  audioUrl,
  revealDuration,
  boost = 1,
}: Props) {
  const [peaks, setPeaks] = useState<number[] | null>(null);
  const [duration, setDuration] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);

  const ctxRef = useRef<AudioContext | null>(null);
  const bufferRef = useRef<AudioBuffer | null>(null);
  const sourceRef = useRef<AudioBufferSourceNode | null>(null);
  const gainRef = useRef<GainNode | null>(null);
  const startOffsetRef = useRef<number>(0);
  const startWallRef = useRef<number>(0);

  // Volume is global across modes. Hydrate from localStorage on mount —
  // SSR sees the default, then we swap in the saved value. A ref tracks
  // the latest value so async audio-load code can pick up the hydrated
  // setting even if it ran before the load effect resolved.
  const [volume, setVolume] = useState<number>(DEFAULT_VOLUME);
  const volumeRef = useRef<number>(DEFAULT_VOLUME);
  useEffect(() => {
    const v = loadVolume();
    volumeRef.current = v;
    setVolume(v);
  }, []);
  useEffect(() => {
    volumeRef.current = volume;
  }, [volume]);

  useEffect(() => {
    let cancelled = false;
    setPeaks(null);
    setDuration(null);
    setError(null);
    setProgress(0);
    setPlaying(false);
    bufferRef.current = null;
    try {
      sourceRef.current?.stop();
    } catch {
      // not running
    }
    sourceRef.current = null;

    (async () => {
      try {
        const res = await fetch(audioUrl);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const buf = await res.arrayBuffer();
        const Ctx =
          window.AudioContext ||
          (window as unknown as { webkitAudioContext: typeof AudioContext })
            .webkitAudioContext;
        const ctx = ctxRef.current ?? new Ctx();
        ctxRef.current = ctx;
        // Master gain sits between every source and the destination so
        // we can amplify the (often quiet) ability clips without re-
        // encoding, and so volume changes during playback take effect
        // immediately. Initialize from the ref so we pick up whatever
        // volume hydration settled on, even if that happened after the
        // load effect started running.
        if (!gainRef.current) {
          const gain = ctx.createGain();
          gain.gain.value = gainFromVolume(volumeRef.current) * boost;
          gain.connect(ctx.destination);
          gainRef.current = gain;
        }
        const audio = await ctx.decodeAudioData(buf);
        if (cancelled) return;

        const data = audio.getChannelData(0);

        // Find the first audibly non-silent sample and skip past it on
        // playback — that way "0.6s reveal" really is 0.6s of *audio*,
        // not 0.6s including encoder priming or pre-roll silence.
        let firstAudible = 0;
        for (let i = 0; i < data.length; i++) {
          if (Math.abs(data[i]) > SILENCE_THRESHOLD) {
            firstAudible = i;
            break;
          }
        }
        let skipSeconds = firstAudible / audio.sampleRate;
        if (skipSeconds < MIN_SKIP_SECONDS) skipSeconds = 0;
        if (skipSeconds > MAX_SKIP_SECONDS) skipSeconds = MAX_SKIP_SECONDS;
        const skipSamples = Math.floor(skipSeconds * audio.sampleRate);
        const audibleDuration = audio.duration - skipSeconds;

        // Build peaks from the audible portion only so the bars line up
        // visually with what the player actually hears.
        const audibleLength = Math.max(1, data.length - skipSamples);
        const bucketSize = Math.max(1, Math.floor(audibleLength / BAR_COUNT));
        const out: number[] = [];
        for (let i = 0; i < BAR_COUNT; i++) {
          let max = 0;
          const start = skipSamples + i * bucketSize;
          const end = Math.min(start + bucketSize, data.length);
          for (let j = start; j < end; j++) {
            const v = Math.abs(data[j]);
            if (v > max) max = v;
          }
          out.push(max);
        }
        const peak = Math.max(...out, 0.001);

        bufferRef.current = audio;
        startOffsetRef.current = skipSeconds;
        setPeaks(out.map((v) => v / peak));
        setDuration(audibleDuration);
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Audio load failed");
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [audioUrl]);

  useEffect(() => {
    if (!playing) return;
    let raf = 0;
    const tick = () => {
      const elapsed = (performance.now() - startWallRef.current) / 1000;
      const p = Math.min(1, elapsed / revealDuration);
      setProgress(p);
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, revealDuration]);

  // Push volume changes to the gain node mid-playback. setTargetAtTime
  // ramps over a short time-constant instead of jumping the gain in one
  // frame, which avoids the "zipper" click you'd otherwise hear when
  // dragging the slider during playback. boost is folded into the same
  // ramp so a hero/role swap during playback (rare but possible after a
  // day rotation) doesn't pop.
  useEffect(() => {
    const gain = gainRef.current;
    const ctx = ctxRef.current;
    if (!gain || !ctx) return;
    gain.gain.setTargetAtTime(
      gainFromVolume(volume) * boost,
      ctx.currentTime,
      0.015,
    );
  }, [volume, boost]);

  useEffect(() => {
    return () => {
      try {
        sourceRef.current?.stop();
      } catch {
        // not running
      }
      sourceRef.current = null;
      const ctx = ctxRef.current;
      ctxRef.current = null;
      ctx?.close().catch(() => {});
    };
  }, []);

  const play = () => {
    const ctx = ctxRef.current;
    const buffer = bufferRef.current;
    if (!ctx || !buffer) return;

    try {
      sourceRef.current?.stop();
    } catch {
      // not running
    }
    sourceRef.current = null;

    setError(null);
    setProgress(0);

    const startNow = () => {
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.connect(gainRef.current ?? ctx.destination);

      // start(when, offset, duration) is sample-accurate against the
      // context's audio clock and stops itself after `duration`. No
      // wall-clock setTimeout, no HTMLAudio startup latency.
      source.start(
        ctx.currentTime,
        startOffsetRef.current,
        revealDuration,
      );
      sourceRef.current = source;

      source.onended = () => {
        if (sourceRef.current === source) {
          sourceRef.current = null;
          setPlaying(false);
          setProgress(1);
        }
      };

      setPlaying(true);
      startWallRef.current = performance.now();
    };

    // iOS Safari parks contexts in "suspended" state until an explicit
    // user gesture wakes them. We MUST wait for resume() to actually
    // settle before scheduling a source — otherwise iOS schedules the
    // source against an audio clock that hasn't started yet and plays
    // silence. resume() on an already-running context is a no-op that
    // resolves on the next microtask, so unconditional await is safe.
    ctx
      .resume()
      .then(startNow)
      .catch((e) => {
        setError(
          e instanceof Error ? e.message : "Audio resume failed",
        );
      });
  };

  const handleVolumeChange = (v: number) => {
    setVolume(v);
    saveVolume(v);
  };

  const totalDuration = duration ?? 0;
  const revealRatio = duration
    ? Math.min(1, revealDuration / duration)
    : 0;
  const playProgressRatio = revealRatio * progress;
  const cursorX = VIEW_WIDTH * playProgressRatio;
  const boundaryX = VIEW_WIDTH * revealRatio;

  return (
    <div className="flex w-full max-w-2xl flex-col items-center gap-4">
      <motion.button
        type="button"
        onClick={play}
        whileTap={{ scale: 0.99 }}
        className="group relative w-full cursor-pointer overflow-hidden rounded-(--radius-card) border border-line bg-inset/40 px-4 py-5 transition-colors hover:border-accent/50 hover:bg-inset/70 focus-visible:border-accent focus-visible:outline-none sm:px-6 sm:py-6"
        aria-label={
          playing
            ? "Playing snippet"
            : `Play ${revealDuration.toFixed(1)} second snippet`
        }
      >
        {peaks ? (
          <>
            <svg
              viewBox={`0 0 ${VIEW_WIDTH} ${VIEW_HEIGHT}`}
              preserveAspectRatio="none"
              className="block h-24 w-full"
              aria-hidden
            >
              {peaks.map((p, i) => {
                const ampl = Math.max(MIN_AMPL, p * MAX_AMPL);
                const x = i * (BAR_WIDTH + BAR_GAP);
                const barRatio = (i + 0.5) / BAR_COUNT;
                const isRevealed = barRatio <= revealRatio;
                const isPlayed = playing && barRatio <= playProgressRatio;

                let className: string;
                if (isPlayed) className = "fill-accent";
                else if (isRevealed)
                  className =
                    "fill-accent/60 transition-[fill] group-hover:fill-accent/85";
                else
                  className =
                    "fill-line transition-[fill] group-hover:fill-line/80";

                return (
                  <rect
                    key={i}
                    x={x}
                    y={CENTER_Y - ampl}
                    width={BAR_WIDTH}
                    height={ampl * 2}
                    rx={1.5}
                    className={className}
                  />
                );
              })}

              {/* dashed boundary marker between revealed/locked */}
              {revealRatio > 0 && revealRatio < 1 && (
                <line
                  x1={boundaryX}
                  x2={boundaryX}
                  y1={2}
                  y2={VIEW_HEIGHT - 2}
                  stroke="var(--color-accent)"
                  strokeWidth="1.5"
                  strokeOpacity={playing ? 0.15 : 0.45}
                  strokeDasharray="3 3"
                />
              )}

              {/* playback cursor */}
              {playing && (
                <line
                  x1={cursorX}
                  x2={cursorX}
                  y1={0}
                  y2={VIEW_HEIGHT}
                  stroke="var(--color-accent)"
                  strokeWidth="2"
                  strokeLinecap="round"
                />
              )}
            </svg>

            <AnimatePresence>
              {!playing && (
                <motion.div
                  key="hint"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.2 }}
                  className="pointer-events-none absolute inset-0 flex items-center justify-center"
                  aria-hidden
                >
                  <span className="rounded-full bg-bg/60 px-3 py-1 font-mono text-[10px] uppercase tracking-[0.22em] text-ink-soft opacity-0 backdrop-blur-sm transition-opacity group-hover:opacity-100">
                    ▶ Play
                  </span>
                </motion.div>
              )}
            </AnimatePresence>
          </>
        ) : (
          <div className="flex h-24 items-center justify-center">
            <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-ink-faint">
              {error ? error : "Loading audio…"}
            </div>
          </div>
        )}
      </motion.button>

      <VolumeSlider value={volume} onChange={handleVolumeChange} />

      <div className="flex items-baseline gap-2 font-mono text-[10px] uppercase tracking-[0.24em]">
        <span className="text-info">Audible</span>
        <span className="font-display text-2xl tracking-normal text-ink">
          {revealDuration.toFixed(1)}
          <span className="ml-0.5 text-base text-ink-soft">s</span>
        </span>
        {totalDuration > 0 && (
          <span className="text-ink-faint">
            of {totalDuration.toFixed(1)}s
          </span>
        )}
      </div>
      {error && peaks && (
        <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-far">
          {error}
        </p>
      )}
    </div>
  );
}
