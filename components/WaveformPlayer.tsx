"use client";

import { useEffect, useRef, useState } from "react";
import { motion } from "motion/react";
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
  // raw file duration, the auto silence-skip the player would have used
  // if no manual override were set, and a pre-bucketed full-file peaks
  // array (untrimmed) that the dev trim editor renders as the backdrop
  // for its draggable start/end handles. Bucketing is done once here so
  // the editor doesn't have to re-decode or re-walk the samples on every
  // render. No-op when not provided (production sound game path).
  onAudioMetadata?: (info: {
    fileDuration: number;
    autoStartOffset: number;
    fullPeaks: number[];
  }) => void;
  // Visual style. "bars" (default) is the sound-mode look — discrete
  // centered amplitude bars with a reveal ladder. "melee" swaps that for
  // a mirrored-bar music visualizer: a row of gradient bars whose heights
  // track the decoded amplitude envelope in sync with the playhead, so the
  // field visibly reacts as the clip plays (tall bars on the hit, a low
  // shimmer in the quiet).
  // The two share ALL the playback / decode / volume / error machinery —
  // only the drawn surface differs — so the bars path is byte-identical
  // when variant is left at its default.
  variant?: "bars" | "melee";
};

// Resolution of the full-file peaks delivered to the dev trim editor.
// Higher than the playable waveform's BAR_COUNT (96) so the editor has
// a touch more detail to drag against — the user is doing pixel-level
// targeting in that view, not glancing at it during gameplay.
const FULL_PEAKS_RESOLUTION = 120;

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

// Waveform decode is best-effort decoration. Retry a transient fetch/decode
// failure a couple times with a short backoff before giving up and falling
// back to the plain play bar — a single R2 hiccup or flaky-mobile blip
// shouldn't cost the player their waveform (and never costs them playback,
// which runs on a wholly independent element — see below).
const DECODE_ATTEMPTS = 3;
const DECODE_BACKOFF_MS = [350, 800];

// Iterative in-place radix-2 Cooley–Tukey FFT — used only by the melee spectrum
// visualizer to turn a window of decoded samples into a frequency spectrum (the
// fixed bars whose heights pulse with the audio). `re`/`im` are equal-length
// arrays whose length MUST be a power of two; both are transformed in place
// (real input → put samples in `re`, zeros in `im`).
function fftInPlace(re: Float64Array, im: Float64Array) {
  const n = re.length;
  // Bit-reversal permutation.
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      const tr = re[i];
      re[i] = re[j];
      re[j] = tr;
      const ti = im[i];
      im[i] = im[j];
      im[j] = ti;
    }
  }
  // Butterfly stages.
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len;
    const wRe = Math.cos(ang);
    const wIm = Math.sin(ang);
    const half = len >> 1;
    for (let i = 0; i < n; i += len) {
      let curRe = 1;
      let curIm = 0;
      for (let k = 0; k < half; k++) {
        const ik = i + k;
        const jk = ik + half;
        const bRe = re[jk] * curRe - im[jk] * curIm;
        const bIm = re[jk] * curIm + im[jk] * curRe;
        re[jk] = re[ik] - bRe;
        im[jk] = im[ik] - bIm;
        re[ik] += bRe;
        im[ik] += bIm;
        const nextRe = curRe * wRe - curIm * wIm;
        curIm = curRe * wIm + curIm * wRe;
        curRe = nextRe;
      }
    }
  }
}

export function WaveformPlayer({
  audioUrl,
  revealDuration,
  boost = 1,
  startOffset = null,
  endOffset = null,
  onAudioMetadata,
  variant = "bars",
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
  // Two independent failure channels, deliberately NOT merged:
  //   • decodeFailed — the waveform couldn't be computed (network/CORS/
  //     decodeAudioData/AudioContext). NON-FATAL: playback runs on a
  //     separate element, so we just drop to the plain play bar.
  //   • loadError — the playback element itself failed to load its source
  //     after auto-retry. This is the only state that actually blocks
  //     sound, so it's the only one that surfaces a tap-to-retry.
  const [decodeFailed, setDecodeFailed] = useState(false);
  const [loadError, setLoadError] = useState(false);
  // Set once the playback element reports it can start. Lets the play
  // affordance appear the instant audio is playable even if the waveform
  // is still decoding (or never decodes).
  const [ready, setReady] = useState(false);
  // Non-blocking note for a play() rejection that isn't a benign re-tap
  // abort. The button stays live so the user can just tap again.
  const [playError, setPlayError] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  // Melee replay guard. el.paused flips to false the instant play() is called,
  // long before the returned promise resolves — so it's an unreliable "is it
  // playing" signal during the start window. Replaying right as a clip ends
  // seeks an `ended` element, whose play() promise is slow/racy to resolve; in
  // that window `playing` is still false (the glyph would show, inviting a tap)
  // yet el.paused is already false (so a tap hits the pause branch and aborts
  // the still-starting playback, stranding the element in a stalled/slow-motion
  // state). `starting` marks the window: the glyph hides and the melee toggle
  // ignores taps until the start settles.
  const [starting, setStarting] = useState(false);
  const startingRef = useRef(false);
  const [progress, setProgress] = useState(0);

  // Bumped to force the playback element to rebuild — used by the manual
  // retry after a hard load error.
  const [reloadKey, setReloadKey] = useState(0);
  // Bumped whenever a fresh playback element is constructed, so the volume
  // effect re-applies the level to the new element (it no longer keys off
  // `peaks`, which may never arrive on the decode-failed path).
  const [elementGen, setElementGen] = useState(0);

  // WebAudio is used only for offline peak detection (decodeAudioData) to
  // render the waveform. Playback goes through an HTMLAudioElement so iOS
  // Safari routes it as a media element rather than ambient WebAudio —
  // otherwise the device's physical ringer-mute switch silences the
  // snippet (which is what mobile users were hitting: the post-reveal
  // <video> still played because <video> is already media category).
  // Tradeoff: HTMLAudioElement.volume is clamped to [0, 1], so the >1
  // role-boost (1.6× for support clips) used to ride on WebAudio's
  // GainNode is lost on this path — see the volume effect below.
  //
  // Crucially, the two are DECOUPLED: the playback element is constructed
  // and made playable on its own effect, with zero dependency on the
  // fetch/decode succeeding. A transient network error, a CORS edge case,
  // Safari's live-AudioContext cap, or a single MP3 the browser can't
  // decodeAudioData() degrades the WAVEFORM to a plain bar — it never
  // takes playback down with it.
  const peaksCtxRef = useRef<AudioContext | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  // Canvas for the melee oscilloscope variant (unused on the bars path).
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const stopTimerRef = useRef<number | null>(null);
  // Pending element-reload timer (auto-retry after a load error). Tracked
  // so clip switches / unmount can cancel it instead of letting it fire
  // against a torn-down element.
  const loadRetryTimerRef = useRef<number | null>(null);
  // If the user taps "retry" we want the rebuilt element to start playing
  // as soon as it can, without a second tap (desktop honors this; iOS may
  // require the explicit tap, which still works — the glyph reappears).
  const playWhenReadyRef = useRef(false);
  // Holds the latest play() closure so the element's async oncanplay
  // handler can invoke it without re-wiring the element per render.
  // Declared here (not next to play()) so the element effect below, which
  // references it, sits after a real initialization rather than in its TDZ.
  const playRef = useRef<(() => void) | null>(null);
  // Effective playback window in seconds (post-trim). startOffsetRef is
  // where play() seeks to; endOffsetRef caps how far playback may run
  // before the stop timer fires. Kept in refs (not state) because play()
  // reads them synchronously inside the click handler. Defaults (0 /
  // Infinity) are the correct untrimmed window when decode never runs.
  const startOffsetRef = useRef<number>(0);
  const endOffsetRef = useRef<number>(Infinity);
  // Latest reveal-window length, mirrored into a ref so the background
  // safety-stop timer (scheduled asynchronously from play()'s promise)
  // always measures against the CURRENT window — not the value captured
  // when the click happened, which goes stale the moment a win expands
  // the snippet to the full clip mid-playback.
  const revealDurationRef = useRef<number>(revealDuration);
  useEffect(() => {
    revealDurationRef.current = revealDuration;
  }, [revealDuration]);

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

  // ── Playback element ──────────────────────────────────────────────────
  // Owns the HTMLAudioElement lifecycle, fully independent of the waveform
  // decode. Rebuilds on a new clip or a manual retry. This is what makes
  // sound mode bulletproof: as long as the browser can stream an MP3 from
  // a <audio src> (no CORS, no decode, no AudioContext required), the
  // player can play — regardless of what the decode path does.
  useEffect(() => {
    setReady(false);
    setLoadError(false);
    setPlayError(null);
    setPlaying(false);
    setStarting(false);
    startingRef.current = false;
    setProgress(0);

    if (stopTimerRef.current != null) {
      window.clearTimeout(stopTimerRef.current);
      stopTimerRef.current = null;
    }
    if (loadRetryTimerRef.current != null) {
      window.clearTimeout(loadRetryTimerRef.current);
      loadRetryTimerRef.current = null;
    }
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.removeAttribute("src");
      audioRef.current.load();
      audioRef.current = null;
    }

    const src = media(audioUrl);
    // Guard: an empty/missing URL would make <audio> load the current
    // document and error. Surface the retry UI rather than a dead button.
    if (!src) {
      setLoadError(true);
      return;
    }

    const el = new Audio();
    // Must match the URL the decode fetch uses so the browser cache
    // short-circuits the second hit and — more importantly — so the
    // relative path resolves against R2 in production. The raw audioUrl
    // would point at the Pages origin, where /sounds is R2-only and 404s
    // as MEDIA_ERR_SRC_NOT_SUPPORTED on the play() promise.
    el.src = src;
    el.preload = "auto";
    // Native events are the source of truth for `playing`, so a missed
    // rAF stop (e.g. the tab backgrounds mid-snippet) can't strand the
    // flag at true — which froze the cursor and hid the play control.
    el.onended = () => {
      // Clip hit its natural end. Clear any pending safety-stop so it can't fire
      // against the next play, and for melee rewind to the onset so the element
      // rests in a clean *paused* state rather than the `ended` state: WebKit is
      // flaky about seek()+play() on a just-ended element — an immediate replay
      // reset the thumbnail but played nothing, then ran the next tap back in
      // slow motion (waiting a beat for `ended` to settle avoided it). Resting
      // at the onset also makes replay a plain resume with no seek, sidestepping
      // the race; the rewind trips the visualizer's seek-back reset so the
      // spectrum re-primes here too.
      if (stopTimerRef.current != null) {
        window.clearTimeout(stopTimerRef.current);
        stopTimerRef.current = null;
      }
      if (variant === "melee") {
        try {
          el.currentTime = startOffsetRef.current;
        } catch {}
      }
      setPlaying(false);
    };
    el.onpause = () => setPlaying(false);
    el.oncanplay = () => {
      setReady(true);
      // Honor a retry-tap that asked to play the moment we're loadable.
      if (playWhenReadyRef.current) {
        playWhenReadyRef.current = false;
        playRef.current?.();
      }
    };

    // Load-error recovery. A media element can fail to fetch/decode its
    // source for transient reasons (a dropped connection, a CDN blip).
    // Silently re-issue load() a couple times before surfacing the manual
    // retry, so the common transient case self-heals.
    let loadAttempts = 0;
    el.onerror = () => {
      // A torn-down element (src removed during cleanup) also fires error;
      // ignore once it's no longer the active element.
      if (audioRef.current !== el) return;
      if (loadAttempts < DECODE_ATTEMPTS - 1) {
        loadAttempts++;
        if (loadRetryTimerRef.current != null) {
          window.clearTimeout(loadRetryTimerRef.current);
        }
        loadRetryTimerRef.current = window.setTimeout(() => {
          loadRetryTimerRef.current = null;
          if (audioRef.current !== el) return;
          el.load();
        }, 500 * loadAttempts);
      } else {
        setLoadError(true);
      }
    };

    el.load();
    el.volume = Math.max(0, Math.min(1, volumeRef.current * boost));
    audioRef.current = el;
    setElementGen((n) => n + 1);

    return () => {
      if (stopTimerRef.current != null) {
        window.clearTimeout(stopTimerRef.current);
        stopTimerRef.current = null;
      }
      if (loadRetryTimerRef.current != null) {
        window.clearTimeout(loadRetryTimerRef.current);
        loadRetryTimerRef.current = null;
      }
      if (audioRef.current === el) {
        el.pause();
        el.removeAttribute("src");
        el.load();
        audioRef.current = null;
      }
    };
    // boost intentionally omitted: a role-boost change shouldn't rebuild
    // the element. The reactive volume effect below re-applies it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [audioUrl, reloadKey]);

  // ── Waveform decode (best-effort, non-fatal) ──────────────────────────
  // Fetch + decodeAudioData purely to draw the waveform and feed the dev
  // trim editor. Retries transient failures; on final failure flips
  // `decodeFailed` so the UI drops to the plain play bar. Never touches
  // the playback element.
  useEffect(() => {
    let cancelled = false;
    setPeaks(null);
    setDuration(null);
    setDecodeFailed(false);
    decodedRef.current = null;

    const sleep = (ms: number) =>
      new Promise<void>((resolve) => window.setTimeout(resolve, ms));

    (async () => {
      for (let attempt = 0; attempt < DECODE_ATTEMPTS; attempt++) {
        try {
          const res = await fetch(media(audioUrl));
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const buf = await res.arrayBuffer();
          if (cancelled) return;
          const Ctx =
            window.AudioContext ||
            (
              window as unknown as {
                webkitAudioContext: typeof AudioContext;
              }
            ).webkitAudioContext;
          if (!Ctx) throw new Error("no WebAudio");
          const ctx = peaksCtxRef.current ?? new Ctx();
          peaksCtxRef.current = ctx;
          const audio = await ctx.decodeAudioData(buf);
          if (cancelled) return;

          const data = audio.getChannelData(0);

          // Find the first audibly non-silent sample — the fallback head
          // trim used when no manual startOffset is provided. The dev trim
          // editor exposes it as "auto" so it can show what the player
          // would otherwise use.
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

          // Bucket the full file once for the dev trim editor. The playable
          // waveform's peaks state is bucketed over only the audible window
          // and re-derived on every trim change; this one represents the
          // entire file so handles dragged outside the current window still
          // have backdrop to align against.
          const fullPeaks: number[] = [];
          if (onAudioMetadataRef.current) {
            const bucketSize = Math.max(
              1,
              Math.floor(data.length / FULL_PEAKS_RESOLUTION),
            );
            let bucketPeak = 0;
            for (let i = 0; i < FULL_PEAKS_RESOLUTION; i++) {
              let max = 0;
              const s = i * bucketSize;
              const e = Math.min(s + bucketSize, data.length);
              for (let j = s; j < e; j++) {
                const v = Math.abs(data[j]);
                if (v > max) max = v;
              }
              fullPeaks.push(max);
              if (max > bucketPeak) bucketPeak = max;
            }
            const norm = bucketPeak > 0 ? bucketPeak : 1;
            for (let i = 0; i < fullPeaks.length; i++) {
              fullPeaks[i] = fullPeaks[i] / norm;
            }
          }

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
            fullPeaks,
          });
          return; // success
        } catch {
          if (cancelled) return;
          if (attempt < DECODE_ATTEMPTS - 1) {
            await sleep(DECODE_BACKOFF_MS[attempt] ?? 800);
            if (cancelled) return;
            continue;
          }
          // Final failure: non-fatal. The plain play bar takes over and
          // playback continues to work on its own element.
          setDecodeFailed(true);
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
    // Melee has no reveal ladder or progress cursor and plays the whole clip to
    // its natural end (onended stops it and rewinds for a clean replay). Running
    // this sound-mode tick for melee only added a second stop path that raced
    // onended at the clip's end — skip it entirely for melee.
    if (variant === "melee") return;
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
  }, [playing, revealDuration, variant]);

  // HTMLAudioElement.volume is clamped to [0, 1], so the >1 headroom we
  // used to get from a WebAudio GainNode is gone. Folding `boost` in
  // here and clamping means support clips (boost=1.6) reach max volume
  // at slider position ~62% instead of receiving an actual amplification.
  // Audible result: support sounds are still meaningfully louder than
  // damage clips at the same slider position, which is the perceptual
  // goal of the boost. Keyed on `elementGen` so the level is (re)applied
  // the moment a fresh element is constructed — not only when the user
  // later moves the slider, and independent of whether peaks ever arrive.
  useEffect(() => {
    const el = audioRef.current;
    if (!el) return;
    el.volume = Math.max(0, Math.min(1, volume * boost));
  }, [volume, boost, elementGen]);

  useEffect(() => {
    return () => {
      const ctx = peaksCtxRef.current;
      peaksCtxRef.current = null;
      ctx?.close().catch(() => {});
    };
  }, []);

  // ── Melee spectrum visualizer ─────────────────────────────────────────
  // Only mounts for variant="melee". A single rAF loop paints a row of
  // mirrored, FIXED-position frequency bars (the reference clip's look): each
  // bar is a frequency band whose height pulses with the audio — the bars
  // never translate, they only grow and shrink in place. Heights come from an
  // FFT of a window of the decoded samples taken at the live playhead
  // (audioRef.currentTime), which ONLY advances while the clip is actually
  // playing — so the spectrum is frozen (static) when paused and reacts in
  // sync with the audio when it plays. Before the first tap the playhead sits
  // at 0, so we bias the window to the clip's first audible sample to preview
  // the onset rather than silence. Decode is decoration here too: if
  // decodedRef never populates (decode failed) the bars sit at their floor
  // height and playback still works on its own element. Reads everything live
  // from refs, so the loop never needs to be torn down mid-clip.
  useEffect(() => {
    if (variant !== "melee") return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const g = canvas.getContext("2d");
    if (!g) return;

    // Resolve theme tokens once (fall back to the known accent hexes).
    const rootStyles = getComputedStyle(document.documentElement);
    const accent =
      rootStyles.getPropertyValue("--color-accent").trim() || "#f26522";
    const accentSoft =
      rootStyles.getPropertyValue("--color-accent-soft").trim() || "#ffa466";

    // Fixed-position frequency-spectrum bars (the reference clip's look): each
    // bar is a frequency band, low → high left → right. A wider F_MIN..F_MAX
    // spread covers more of the spectrum; more BARS = a finer comb.
    const FFT_SIZE = 2048; // sample window fed to the FFT (must be a power of 2)
    const BARS = 56; // number of mirrored frequency bars
    const F_MIN = 45; // lowest frequency mapped to a bar (Hz)
    const F_MAX = 13000; // highest frequency mapped to a bar (Hz)
    const GAMMA = 0.4; // spectrum compression — lower lifts the quiet bands
    const OUT_GAIN = 1.35; // push the loudest bands toward the ceiling
    const MIN_BAR_FRAC = 0.04; // shortest bar, as a fraction of the half-height
    // Auto-gain (AGC): normalize each frame against a running level that snaps
    // up instantly and releases slowly, so a melee clip's quieter body/tail get
    // lifted into view (lively like the reference) while the hit still peaks.
    // FLOOR_FRAC caps the gain so near-silence doesn't amplify into noise.
    const AGC_DECAY = 0.984; // per-frame release of the running level
    const FLOOR_FRAC = 0.025; // gain floor, as a fraction of the clip peak
    // Per-bar attack/decay smoothing: bars jump up fast and fall back slowly
    // (the reference's springy bounce) instead of strobing frame-to-frame.
    const ATTACK = 0.6;
    const DECAY = 0.13;
    // Gradient endpoints (warm → hot), echoing the reference's red→magenta.
    const GRAD_FROM = accentSoft; // light orange
    const GRAD_TO = "#ff3d7f"; // hot pink

    // Buffers + per-clip caches, allocated once and reused every frame so the
    // rAF loop never churns garbage.
    const re = new Float64Array(FFT_SIZE);
    const im = new Float64Array(FFT_SIZE);
    const hann = new Float64Array(FFT_SIZE);
    for (let i = 0; i < FFT_SIZE; i++) {
      hann[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (FFT_SIZE - 1));
    }
    const displayed = new Float64Array(BARS); // smoothed bar heights (0..1)
    const rawBands = new Float64Array(BARS); // this frame's raw band magnitudes
    let bandBins: number[][] = []; // [startBin, endBin) per bar
    let cachedSpecPeak = 1; // loudest band magnitude in the clip (AGC ceiling)
    let agc = 1; // running auto-gain level, advances only while playing
    let raf = 0;
    let cachedDecoded: typeof decodedRef.current = null;
    let lastDrawT = 0; // previous frame's playhead — detects a replay seek-back

    // Load one Hann-windowed FFT window of samples starting at `s0`, transform
    // in place. Caller must guarantee s0 in [0, data.length - FFT_SIZE].
    const loadWindow = (data: Float32Array, s0: number) => {
      for (let i = 0; i < FFT_SIZE; i++) {
        re[i] = data[s0 + i] * hann[i];
        im[i] = 0;
      }
      fftInPlace(re, im);
    };

    // Mean FFT magnitude across a bar's frequency-bin range (call after
    // loadWindow has populated re/im).
    const bandMag = (b: number): number => {
      const bs = bandBins[b][0];
      const be = bandBins[b][1];
      let sum = 0;
      for (let k = bs; k < be; k++)
        sum += Math.sqrt(re[k] * re[k] + im[k] * im[k]);
      return sum / (be - bs);
    };

    // Per-clip setup: log-spaced frequency bins per bar + the loudest band
    // magnitude anywhere in the clip, so per-frame bars normalize against a
    // stable reference (this preserves the natural bass-left taper instead of
    // auto-gaining every band to full height every frame).
    const prepareClip = (data: Float32Array, sampleRate: number) => {
      const nyqBin = FFT_SIZE / 2;
      const binHz = sampleRate / FFT_SIZE;
      bandBins = [];
      for (let b = 0; b < BARS; b++) {
        const f0 = F_MIN * Math.pow(F_MAX / F_MIN, b / BARS);
        const f1 = F_MIN * Math.pow(F_MAX / F_MIN, (b + 1) / BARS);
        const b0 = Math.max(1, Math.min(nyqBin - 1, Math.floor(f0 / binHz)));
        const b1 = Math.max(b0 + 1, Math.min(nyqBin, Math.ceil(f1 / binHz)));
        bandBins.push([b0, b1]);
      }
      let peak = 0;
      for (let s = 0; s + FFT_SIZE <= data.length; s += FFT_SIZE) {
        loadWindow(data, s);
        for (let b = 0; b < BARS; b++) {
          const m = bandMag(b);
          if (m > peak) peak = m;
        }
      }
      cachedSpecPeak = peak > 1e-9 ? peak : 1;
      agc = cachedSpecPeak;
      displayed.fill(0);
    };

    const draw = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const cssW = canvas.clientWidth || 1;
      const cssH = canvas.clientHeight || 1;
      const w = Math.round(cssW * dpr);
      const h = Math.round(cssH * dpr);
      if (canvas.width !== w) canvas.width = w;
      if (canvas.height !== h) canvas.height = h;
      g.clearRect(0, 0, w, h);
      const midY = h / 2;

      const decoded = decodedRef.current;
      const el = audioRef.current;
      const live = !!el && !el.paused;
      const usableH = midY - Math.max(2, 3 * dpr);

      if (decoded && decoded.data.length > FFT_SIZE) {
        const { data, sampleRate } = decoded;
        if (decoded !== cachedDecoded) {
          prepareClip(data, sampleRate);
          cachedDecoded = decoded;
        }
        // FFT window CENTERED on the playhead. currentTime is frozen when
        // paused (static spectrum) and biased to the onset before the first
        // play so the resting frame previews the hit rather than silence.
        const startBias =
          Number.isFinite(startOffsetRef.current) && startOffsetRef.current > 0
            ? startOffsetRef.current
            : 0;
        const curT = el ? el.currentTime : 0;
        // A backward jump in the playhead means the clip was restarted (a
        // replay seeks back to the onset). Over the previous full playthrough
        // the AGC decayed toward the quiet tail (to ~0.3-0.55x the clip peak),
        // so without re-priming it the replay normalizes the loud hit against
        // that lowered reference — over-gaining the whole field, swelling the
        // spectrum and flattening its taper (and slamming bands to the ceiling
        // when the tail is long enough to decay further). Reset it to the clip
        // peak (the exact state prepareClip leaves) so a replay looks identical
        // to the first play, spectrum taper and all.
        if (curT < lastDrawT - 0.05) {
          agc = cachedSpecPeak;
          displayed.fill(0);
        }
        lastDrawT = curT;
        const center = Math.floor(Math.max(curT, startBias) * sampleRate);
        let s0 = center - FFT_SIZE / 2;
        if (s0 < 0) s0 = 0;
        if (s0 > data.length - FFT_SIZE) s0 = data.length - FFT_SIZE;
        loadWindow(data, s0);
        // First pass: raw band magnitudes + this frame's peak, to drive the
        // auto-gain. AGC advances only while playing, so it (and the whole
        // field) stays frozen when paused.
        let rawMax = 0;
        for (let b = 0; b < BARS; b++) {
          const m = bandMag(b);
          rawBands[b] = m;
          if (m > rawMax) rawMax = m;
        }
        if (live) agc = Math.max(rawMax, agc * AGC_DECAY);
        const ref = Math.max(agc, cachedSpecPeak * FLOOR_FRAC);
        for (let b = 0; b < BARS; b++) {
          const norm = rawBands[b] / ref;
          let t = Math.pow(norm < 0 ? 0 : norm, GAMMA) * OUT_GAIN;
          t = t < 0 ? 0 : t > 1 ? 1 : t;
          // Snap when paused/at rest (perfectly static); attack fast + decay
          // slow while playing so bars spring up and settle down.
          if (!live) displayed[b] = t;
          else if (t > displayed[b]) displayed[b] += (t - displayed[b]) * ATTACK;
          else displayed[b] += (t - displayed[b]) * DECAY;
        }
      } else {
        // Still decoding / decode failed — settle the bars down to the floor.
        for (let b = 0; b < BARS; b++) {
          displayed[b] = live ? displayed[b] * (1 - DECAY) : 0;
        }
      }

      // Mirrored bars at FIXED positions with a horizontal warm → hot gradient
      // and a soft glow. Only the heights change frame-to-frame.
      const grad = g.createLinearGradient(0, 0, w, 0);
      grad.addColorStop(0, GRAD_FROM);
      grad.addColorStop(1, GRAD_TO);
      g.save();
      g.fillStyle = grad;
      g.shadowColor = accent;
      g.shadowBlur = (live ? 7 : 3) * dpr;
      g.globalAlpha = live ? 1 : 0.8;
      const slot = w / BARS;
      const barW = Math.max(1.5, slot * 0.5);
      const minH = usableH * MIN_BAR_FRAC;
      for (let b = 0; b < BARS; b++) {
        const half = Math.max(minH, displayed[b] * usableH);
        const x = b * slot + (slot - barW) / 2;
        const y = midY - half;
        const bh = half * 2;
        const r = Math.min(barW / 2, half);
        g.beginPath();
        if (g.roundRect) g.roundRect(x, y, barW, bh, r);
        else g.rect(x, y, barW, bh);
        g.fill();
      }
      g.restore();

      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
    // Depends only on `variant`; everything dynamic (decoded samples, the
    // playhead, the trim offsets) is read live from refs inside the loop.
  }, [variant]);

  const play = (seekToStart = true) => {
    const el = audioRef.current;
    if (!el) return;

    setPlayError(null);
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
    // Seek to the audible start on a fresh play; a melee resume passes
    // seekToStart=false so playback continues from where it was paused.
    if (seekToStart) {
      try {
        el.currentTime = startOffsetRef.current;
      } catch {
        // Some browsers throw if metadata isn't loaded yet — leave
        // currentTime at 0 and let the silence-skip happen on replay.
      }
    }
    el.volume = Math.max(0, Math.min(1, volumeRef.current * boost));

    // play() must be called synchronously from inside the click handler
    // for iOS to count it as a user gesture. We call it directly (not
    // from inside a .then()) and wire success/failure off the returned
    // promise. Older browsers may return undefined from play() — fall
    // back to assuming success in that branch.
    //
    // Background-tab fallback stop. The rAF tick in the progress effect is
    // the primary, frame-precise stop, but it doesn't fire while the tab is
    // backgrounded — this covers that case. Two guards keep it from
    // misfiring:
    //   1. Clear any pending timer before scheduling. A fast double-tap can
    //      fire two play() calls before either promise resolves; without
    //      this, the second .then() would overwrite stopTimerRef and leak
    //      the first timer, which then fires ~revealDuration+750ms later and
    //      pauses whatever is playing by then. That orphaned-timer pile-up
    //      is what made the button "work, then not" after a couple clicks.
    //   2. On fire, re-check the LIVE playhead against the CURRENT reveal
    //      window (via refs) and pause only if genuinely overrun, else
    //      reschedule. So it never cuts short when a win expands
    //      revealDuration mid-play, nor stops a snippet just replayed.
    const scheduleSafetyStop = () => {
      if (stopTimerRef.current != null) {
        window.clearTimeout(stopTimerRef.current);
        stopTimerRef.current = null;
      }
      const check = () => {
        const cur = audioRef.current;
        if (!cur) {
          stopTimerRef.current = null;
          return;
        }
        const elapsed = cur.currentTime - startOffsetRef.current;
        if (
          elapsed >= revealDurationRef.current ||
          cur.currentTime >= endOffsetRef.current
        ) {
          stopTimerRef.current = null;
          cur.pause();
          setPlaying(false);
          setProgress(1);
          return;
        }
        stopTimerRef.current = window.setTimeout(check, 250);
      };
      stopTimerRef.current = window.setTimeout(
        check,
        revealDurationRef.current * 1000 + 750,
      );
    };

    // Mark the start in-flight before play(): el.paused is already false from
    // here, but playback isn't confirmed until this promise resolves. The glyph
    // + melee toggle key off `starting` across this window (see its decl).
    startingRef.current = true;
    setStarting(true);
    const result = el.play();
    if (result && typeof result.then === "function") {
      result
        .then(() => {
          startingRef.current = false;
          setStarting(false);
          setPlaying(true);
          scheduleSafetyStop();
        })
        .catch((e) => {
          startingRef.current = false;
          setStarting(false);
          // A fast re-tap interrupts the prior play() promise with an
          // AbortError — not a real failure, so don't surface it.
          if (e instanceof DOMException && e.name === "AbortError") return;
          // NotSupported/NotAllowed etc.: the element may need a rebuild
          // (e.g. its source errored). Surface the retry path rather than
          // a dead button.
          if (e instanceof DOMException && e.name === "NotSupportedError") {
            setLoadError(true);
            return;
          }
          setPlayError(
            e instanceof Error ? e.message : "Audio play failed",
          );
        });
    } else {
      startingRef.current = false;
      setStarting(false);
      setPlaying(true);
      scheduleSafetyStop();
    }
  };

  // Keep the pinned ref pointing at the latest play() closure (it closes
  // over current state) so the element's async oncanplay handler always
  // invokes an up-to-date version.
  useEffect(() => {
    playRef.current = play;
  });

  // Hard load failure → rebuild the element and play it as soon as it's
  // loadable. The retry tap is a user gesture, so the deferred play still
  // counts on iOS; if the browser declines, the play glyph simply reappears
  // for an explicit second tap.
  const handleRetry = () => {
    playWhenReadyRef.current = true;
    setLoadError(false);
    setReady(false);
    setReloadKey((k) => k + 1);
  };

  // Melee plays the FULL clip, so its tap is a real play/pause TOGGLE (not
  // sound mode's replay-the-snippet): tapping while playing pauses and freezes
  // the scope; tapping again resumes from where it stopped; from a fresh or
  // finished clip it (re)starts at the audible onset. This is what makes the
  // control feel reliable instead of "sometimes restarts, sometimes nothing."
  const handleMeleePlayPause = () => {
    const el = audioRef.current;
    if (!el) return;
    // A start is still in flight (play() called, promise not resolved yet).
    // Ignore the tap: el.paused is already false, so the pause branch below
    // would abort the starting playback and strand the element mid-seek — the
    // stalled, slow-motion replay you get from double-tapping right as a clip
    // ends. The start settles on its own, and the glyph is hidden meanwhile.
    if (startingRef.current) return;
    if (!el.paused) {
      if (stopTimerRef.current != null) {
        window.clearTimeout(stopTimerRef.current);
        stopTimerRef.current = null;
      }
      el.pause();
      setPlaying(false);
      return;
    }
    // Resume from the current position, unless we're at/past the end or before
    // the audible start — then restart from the onset.
    const end = Number.isFinite(endOffsetRef.current)
      ? endOffsetRef.current
      : el.duration || Infinity;
    const restart =
      el.currentTime >= end - 0.05 ||
      el.currentTime < startOffsetRef.current - 0.01;
    play(restart);
  };

  const handleBarClick = () => {
    if (loadError) {
      handleRetry();
      return;
    }
    if (variant === "melee") {
      handleMeleePlayPause();
      return;
    }
    play();
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

  // Centered play affordance, shared by the rich waveform and the fallback
  // bar. Hidden while playing (or starting) so nothing overlays the cursor
  // (sound) or the pulsing spectrum (melee) — the moving visual is itself the
  // "it's playing" signal, and hiding it across the start window keeps it from
  // flickering back during a replay's seek and inviting a stray second tap. It
  // fades back in the instant playback stops, so the tap-to-replay (sound) /
  // tap-to-resume (melee toggle) affordance stays discoverable.
  const playGlyph = (
    <div
      className="pointer-events-none absolute inset-0 flex items-center justify-center"
      aria-hidden
    >
      <svg
        viewBox="0 0 24 24"
        className={`h-9 w-9 fill-ink drop-shadow-[0_1px_3px_rgba(0,0,0,0.55)] transition-all duration-200 group-hover:scale-110 ${
          playing || starting
            ? "opacity-0"
            : "ml-0.5 opacity-60 group-hover:opacity-100"
        }`}
        aria-hidden
      >
        <path d="M8 5v14l11-7z" />
      </svg>
    </div>
  );

  let barAriaLabel: string;
  if (loadError) barAriaLabel = "Audio failed to load. Tap to retry";
  else if (variant === "melee")
    barAriaLabel = playing ? "Playing melee clip" : "Play melee clip";
  else if (playing) barAriaLabel = "Playing snippet";
  else barAriaLabel = `Play ${revealDuration.toFixed(1)} second snippet`;

  return (
    <div
      className={
        "flex w-full flex-col items-center gap-4 " +
        // Melee's bar field reads cleaner in a slightly narrower frame than
        // sound's full-width waveform.
        (variant === "melee" ? "max-w-xl" : "max-w-2xl")
      }
    >
      <motion.button
        type="button"
        onClick={handleBarClick}
        whileTap={{ scale: 0.99 }}
        className="group relative w-full cursor-pointer overflow-hidden rounded-(--radius-card) border border-line bg-inset/40 px-4 py-5 transition-colors hover:border-accent/50 hover:bg-inset/70 focus-visible:border-accent focus-visible:outline-none sm:px-6 sm:py-6"
        aria-label={barAriaLabel}
      >
        {loadError ? (
          // Only state that actually blocks sound: offer a retry.
          <div className="flex h-24 flex-col items-center justify-center gap-2">
            <svg
              viewBox="0 0 24 24"
              className="h-7 w-7 fill-none stroke-accent"
              strokeWidth="2"
              aria-hidden
            >
              <path
                d="M3 12a9 9 0 1 0 3-6.7M3 4v4h4"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-ink-soft">
              Couldn&apos;t load audio · tap to retry
            </div>
          </div>
        ) : variant === "melee" ? (
          // Live oscilloscope. The canvas is painted by the rAF loop above;
          // the play glyph rides on top until the element is playing. A
          // quiet "Loading audio…" shows only until the element is loadable.
          <>
            <canvas ref={canvasRef} className="block h-32 w-full" aria-hidden />
            {ready || decodeFailed || peaks ? (
              playGlyph
            ) : (
              <div
                className="pointer-events-none absolute inset-0 flex items-center justify-center"
                aria-hidden
              >
                <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-ink-faint">
                  Loading audio…
                </div>
              </div>
            )}
          </>
        ) : peaks ? (
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

            {/* Play affordance sits on top of the waveform, centered, and
                stays visible at all times (not hover-only) so it can't get
                lost — especially after a win, when every bar lights up.
                pointer-events-none lets clicks fall through to the button. */}
            {playGlyph}
          </>
        ) : (
          // Fallback bar: the waveform is still decoding OR decode failed
          // outright. Either way the element can (or soon will) play, so we
          // render a flat skeleton + the same play glyph — a fully working
          // play control with no waveform decoration. The glyph appears as
          // soon as the element is loadable; until then we show a quiet
          // "Loading audio…" that still accepts a tap.
          <>
            <svg
              viewBox={`0 0 ${VIEW_WIDTH} ${VIEW_HEIGHT}`}
              preserveAspectRatio="none"
              className="block h-24 w-full"
              aria-hidden
            >
              {Array.from({ length: BAR_COUNT }).map((_, i) => (
                <rect
                  key={i}
                  x={i * (BAR_WIDTH + BAR_GAP)}
                  y={CENTER_Y - MIN_AMPL}
                  width={BAR_WIDTH}
                  height={MIN_AMPL * 2}
                  rx={1.5}
                  className="fill-line"
                />
              ))}
            </svg>
            {ready || decodeFailed ? (
              playGlyph
            ) : (
              <div
                className="pointer-events-none absolute inset-0 flex items-center justify-center"
                aria-hidden
              >
                <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-ink-faint">
                  Loading audio…
                </div>
              </div>
            )}
          </>
        )}
      </motion.button>

      <VolumeSlider value={volume} onChange={handleVolumeChange} />

      <div className="flex items-baseline gap-2 font-mono text-[10px] uppercase tracking-[0.24em]">
        {variant === "melee" ? (
          // The whole clip is always playable in melee — no reveal ladder —
          // so just surface its length rather than "X of Y".
          <>
            <span className="text-info">Melee clip</span>
            <span className="font-display text-2xl tracking-normal text-ink">
              {totalDuration.toFixed(1)}
              <span className="ml-0.5 text-base text-ink-soft">s</span>
            </span>
          </>
        ) : (
          <>
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
          </>
        )}
      </div>
      {playError && (
        <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-far">
          {playError}
        </p>
      )}
    </div>
  );
}
