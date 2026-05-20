"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { DEFAULT_VOLUME, loadVolume, saveVolume } from "@/lib/audio";
import { media } from "@/lib/media";
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
  // Manual trim window (seconds from the START of the source file). When
  // either is provided, it supersedes the corresponding side of the auto
  // silence-skip — startOffset replaces the head trim, endOffset caps the
  // tail. Persisted in data/sound-clip-trims.json and maintained from the
  // dev trim editor on the sound page.
  startOffset?: number | null;
  endOffset?: number | null;
  // Fires once per audio load with metadata the dev trim UI needs: the
  // raw file duration and the auto silence-skip the player would have used
  // if no manual override were set. Lets the editor show both values for
  // reference. No-op when not provided (production sound game path).
  onAudioMetadata?: (info: {
    fileDuration: number;
    autoStartOffset: number;
  }) => void;
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
  startOffset = null,
  endOffset = null,
  onAudioMetadata,
}: Props) {
  // Pin the callback in a ref so changing identity (parent re-renders
  // each keystroke in the dev trim editor) doesn't re-trigger the audio
  // load effect — which would refetch and re-decode the file on every
  // nudge button press.
  const onAudioMetadataRef = useRef(onAudioMetadata);
  useEffect(() => {
    onAudioMetadataRef.current = onAudioMetadata;
  }, [onAudioMetadata]);
  const [peaks, setPeaks] = useState<number[] | null>(null);
  const [duration, setDuration] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);

  // WebAudio is used only for offline peak detection (decodeAudioData) to
  // render the waveform. Playback goes through an HTMLAudioElement so iOS
  // Safari routes it as a media element rather than ambient WebAudio —
  // otherwise the device's physical ringer-mute switch silences the
  // snippet (which is what mobile users were hitting: the post-reveal
  // <video> still played because <video> is already media category).
  // Tradeoff: HTMLAudioElement.volume is clamped to [0, 1], so the >1
  // role-boost (1.6× for support clips) used to ride on WebAudio's
  // GainNode is lost on this path — see the volume effect below.
  const peaksCtxRef = useRef<AudioContext | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const stopTimerRef = useRef<number | null>(null);
  // Effective playback window in seconds (post-trim). startOffsetRef is
  // where play() seeks to; endOffsetRef caps how far playback may run
  // before the stop timer fires. Kept in refs (not state) because play()
  // reads them synchronously inside the click handler.
  const startOffsetRef = useRef<number>(0);
  const endOffsetRef = useRef<number>(Infinity);

  // Decoded sample data retained across trim adjustments so the user can
  // nudge start/end without paying for a re-fetch + re-decode on each
  // keypress. Updated only when the audioUrl itself changes.
  const decodedRef = useRef<{
    data: Float32Array;
    sampleRate: number;
    fileDuration: number;
    autoStartOffset: number;
  } | null>(null);
  const [decodeVersion, setDecodeVersion] = useState(0);

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
    decodedRef.current = null;

    // Tear down any in-flight playback from the previous audioUrl.
    if (stopTimerRef.current != null) {
      window.clearTimeout(stopTimerRef.current);
      stopTimerRef.current = null;
    }
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.removeAttribute("src");
      audioRef.current.load();
      audioRef.current = null;
    }

    (async () => {
      try {
        const res = await fetch(media(audioUrl));
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const buf = await res.arrayBuffer();
        const Ctx =
          window.AudioContext ||
          (window as unknown as { webkitAudioContext: typeof AudioContext })
            .webkitAudioContext;
        const ctx = peaksCtxRef.current ?? new Ctx();
        peaksCtxRef.current = ctx;
        const audio = await ctx.decodeAudioData(buf);
        if (cancelled) return;

        const data = audio.getChannelData(0);

        // Find the first audibly non-silent sample. This is the fallback
        // head trim used when no manual startOffset is provided — the
        // dev trim editor exposes it as "auto" so the editor can show
        // what the player would otherwise use.
        let firstAudible = 0;
        for (let i = 0; i < data.length; i++) {
          if (Math.abs(data[i]) > SILENCE_THRESHOLD) {
            firstAudible = i;
            break;
          }
        }
        let autoStartSeconds = firstAudible / audio.sampleRate;
        if (autoStartSeconds < MIN_SKIP_SECONDS) autoStartSeconds = 0;
        if (autoStartSeconds > MAX_SKIP_SECONDS)
          autoStartSeconds = MAX_SKIP_SECONDS;

        // Construct the playback element. Re-fetching the same URL is
        // cheap — the browser cache short-circuits the second hit — and
        // setting src + load() is the documented path that keeps iOS's
        // audio session in media category. We don't pipe through
        // createMediaElementSource: that re-introduces a WebAudio
        // destination, which reports of iOS's silent-switch handling are
        // mixed on. Plain HTMLAudio is the bulletproof route.
        const el = new Audio();
        el.src = audioUrl;
        el.preload = "auto";
        el.load();
        audioRef.current = el;

        // Float32Array is backed by a transferable ArrayBuffer; copy it
        // so the AudioBuffer can be GC'd while we keep just the channel
        // data we need for re-bucketing on trim changes.
        decodedRef.current = {
          data: new Float32Array(data),
          sampleRate: audio.sampleRate,
          fileDuration: audio.duration,
          autoStartOffset: autoStartSeconds,
        };
        setDecodeVersion((v) => v + 1);
        onAudioMetadataRef.current?.({
          fileDuration: audio.duration,
          autoStartOffset: autoStartSeconds,
        });
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

  // Re-bucket peaks and update the playback window whenever the user
  // adjusts the trim. Pure compute over already-decoded samples — no
  // refetch, no re-decode. Splitting this off the load effect means the
  // dev trim editor can nudge ±10ms without thrashing the network.
  useEffect(() => {
    const decoded = decodedRef.current;
    if (!decoded) return;
    const { data, sampleRate, fileDuration, autoStartOffset } = decoded;

    const rawStart = startOffset != null ? startOffset : autoStartOffset;
    const rawEnd = endOffset != null ? endOffset : fileDuration;
    // Clamp to valid bounds and guarantee a non-empty window so a typo
    // in the trim editor can't render an empty waveform / divide-by-zero.
    const start = Math.max(0, Math.min(fileDuration, rawStart));
    const end = Math.max(start + 0.05, Math.min(fileDuration, rawEnd));
    const audibleDuration = end - start;

    const startSample = Math.floor(start * sampleRate);
    const endSample = Math.min(data.length, Math.ceil(end * sampleRate));
    const windowLength = Math.max(1, endSample - startSample);
    const bucketSize = Math.max(1, Math.floor(windowLength / BAR_COUNT));
    const out: number[] = [];
    for (let i = 0; i < BAR_COUNT; i++) {
      let max = 0;
      const s = startSample + i * bucketSize;
      const e = Math.min(s + bucketSize, endSample);
      for (let j = s; j < e; j++) {
        const v = Math.abs(data[j]);
        if (v > max) max = v;
      }
      out.push(max);
    }
    const peak = Math.max(...out, 0.001);

    startOffsetRef.current = start;
    endOffsetRef.current = end;
    setPeaks(out.map((v) => v / peak));
    setDuration(audibleDuration);
  }, [decodeVersion, startOffset, endOffset]);

  useEffect(() => {
    if (!playing) return;
    const el = audioRef.current;
    if (!el) return;
    let raf = 0;
    // Read directly from the audio playhead instead of a wall-clock
    // anchor. el.play()'s promise can resolve ~100-200ms before iOS
    // Safari's audio hardware actually starts producing sound, so a
    // wall-clock cursor anchored at promise resolution would lead the
    // audio by that startup latency — exactly the desync users reported.
    // Reading el.currentTime at rAF rate is interpolated sub-frame on
    // modern browsers, so motion stays smooth, and the cursor and the
    // audio share the same source of truth (el.currentTime), so they
    // can't drift apart by definition.
    //
    // The stop trigger also rides on the playhead here. Doing it via a
    // setTimeout from play()'s promise would cut audio short by the same
    // startup latency the cursor used to lead by — at small revealDuration
    // values (0.4s early-game) that's a noticeable 25% loss. The outer
    // setTimeout in play() is still scheduled but with a generous safety
    // margin: it's a fallback for backgrounded tabs where rAF doesn't
    // fire, not the primary stop path.
    const tick = () => {
      const elapsed = el.currentTime - startOffsetRef.current;
      const p = Math.max(0, Math.min(1, elapsed / revealDuration));
      setProgress(p);
      // Stop on whichever fires first: the revealed snippet length is up,
      // OR the playhead has crossed the manual end-trim. The latter
      // matters when the trim editor caps a clip shorter than its full
      // file length and the snippet ladder is still scaled to the full
      // reveal — without the endOffsetRef guard, the player would keep
      // running into the trimmed-out tail.
      if (elapsed >= revealDuration || el.currentTime >= endOffsetRef.current) {
        el.pause();
        if (stopTimerRef.current != null) {
          window.clearTimeout(stopTimerRef.current);
          stopTimerRef.current = null;
        }
        setPlaying(false);
        setProgress(1);
        return;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, revealDuration]);

  // HTMLAudioElement.volume is clamped to [0, 1], so the >1 headroom we
  // used to get from a WebAudio GainNode is gone. Folding `boost` in
  // here and clamping means support clips (boost=1.6) reach max volume
  // at slider position ~62% instead of receiving an actual amplification.
  // Audible result: support sounds are still meaningfully louder than
  // damage clips at the same slider position, which is the perceptual
  // goal of the boost. Listed as deps: `peaks` so the volume is applied
  // the moment the element is constructed, not only when the user later
  // moves the slider.
  useEffect(() => {
    const el = audioRef.current;
    if (!el) return;
    el.volume = Math.max(0, Math.min(1, volume * boost));
  }, [volume, boost, peaks]);

  useEffect(() => {
    return () => {
      if (stopTimerRef.current != null) {
        window.clearTimeout(stopTimerRef.current);
        stopTimerRef.current = null;
      }
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.removeAttribute("src");
        audioRef.current.load();
        audioRef.current = null;
      }
      const ctx = peaksCtxRef.current;
      peaksCtxRef.current = null;
      ctx?.close().catch(() => {});
    };
  }, []);

  const play = () => {
    const el = audioRef.current;
    if (!el) return;

    setError(null);
    setProgress(0);

    // Cancel any pending stop from a prior tap so a fast re-tap doesn't
    // get its snippet cut short by the previous one's pause timer.
    if (stopTimerRef.current != null) {
      window.clearTimeout(stopTimerRef.current);
      stopTimerRef.current = null;
    }

    // Seek + volume must be set *before* play() so the first audible
    // frame is at the right offset and amplitude. Reading volumeRef
    // (not the `volume` state directly) keeps us off the closure-
    // staleness footgun if the slider was dragged between renders.
    try {
      el.currentTime = startOffsetRef.current;
    } catch {
      // Some browsers throw if metadata isn't loaded yet — leave
      // currentTime at 0 and let the silence-skip happen on replay.
    }
    el.volume = Math.max(0, Math.min(1, volumeRef.current * boost));

    // play() must be called synchronously from inside the click handler
    // for iOS to count it as a user gesture. We call it directly (not
    // from inside a .then()) and wire success/failure off the returned
    // promise. Older browsers may return undefined from play() — fall
    // back to assuming success in that branch.
    //
    // The setTimeout below is a safety net for backgrounded tabs (where
    // the rAF tick in the progress effect doesn't fire). It's padded by
    // 750ms beyond the nominal revealDuration so that, in a foreground
    // tab, the playhead-anchored stop inside the tick always wins the
    // race against this fallback. Without the padding, this timer would
    // cut audio short by the iOS play()-vs-actual-start latency.
    const scheduleSafetyStop = () => {
      stopTimerRef.current = window.setTimeout(() => {
        stopTimerRef.current = null;
        const cur = audioRef.current;
        if (!cur) return;
        cur.pause();
        setPlaying(false);
        setProgress(1);
      }, revealDuration * 1000 + 750);
    };

    const result = el.play();
    if (result && typeof result.then === "function") {
      result
        .then(() => {
          setPlaying(true);
          scheduleSafetyStop();
        })
        .catch((e) => {
          setError(e instanceof Error ? e.message : "Audio play failed");
        });
    } else {
      setPlaying(true);
      scheduleSafetyStop();
    }
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
