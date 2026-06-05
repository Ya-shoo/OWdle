import { media } from "./media";

// Bars rendered by both the interactive WaveformPlayer and the share
// card's static waveform. Keep in sync with WaveformPlayer's BAR_COUNT.
export const WAVEFORM_BAR_COUNT = 96;

// Mirrors WaveformPlayer's head-silence auto-skip so a waveform computed
// from scratch here matches what the player displayed during the round.
const SILENCE_THRESHOLD = 0.01;
const MIN_SKIP_SECONDS = 0.005;
const MAX_SKIP_SECONDS = 0.25;

// Fetch + decode an audio clip and bucket it into normalized peaks — the
// exact shape WaveformPlayer renders. Used by the sound share card, which
// needs a static waveform without mounting the player: the player
// unmounts at reveal, and never mounts at all when a finished round is
// reopened in a later session. The fetch is browser-cached (same URL the
// player used), so the common cost is just one decode.
export async function computeWaveformPeaks(opts: {
  audioUrl: string;
  startOffset?: number | null;
  endOffset?: number | null;
}): Promise<number[]> {
  const res = await fetch(media(opts.audioUrl));
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const buf = await res.arrayBuffer();
  const Ctx =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext: typeof AudioContext })
      .webkitAudioContext;
  const ctx = new Ctx();
  try {
    const audio = await ctx.decodeAudioData(buf);
    const data = audio.getChannelData(0);
    const fileDuration = audio.duration;

    // Auto head-trim fallback, same rules as the player: skip leading
    // silence unless a manual start trim supersedes it.
    let autoStart = 0;
    if (opts.startOffset == null) {
      let firstAudible = 0;
      for (let i = 0; i < data.length; i++) {
        if (Math.abs(data[i]) > SILENCE_THRESHOLD) {
          firstAudible = i;
          break;
        }
      }
      autoStart = firstAudible / audio.sampleRate;
      if (autoStart < MIN_SKIP_SECONDS) autoStart = 0;
      if (autoStart > MAX_SKIP_SECONDS) autoStart = MAX_SKIP_SECONDS;
    }

    const rawStart = opts.startOffset != null ? opts.startOffset : autoStart;
    const rawEnd = opts.endOffset != null ? opts.endOffset : fileDuration;
    const start = Math.max(0, Math.min(fileDuration, rawStart));
    const end = Math.max(start + 0.05, Math.min(fileDuration, rawEnd));

    const startSample = Math.floor(start * audio.sampleRate);
    const endSample = Math.min(data.length, Math.ceil(end * audio.sampleRate));
    const windowLength = Math.max(1, endSample - startSample);
    const bucketSize = Math.max(
      1,
      Math.floor(windowLength / WAVEFORM_BAR_COUNT),
    );
    const out: number[] = [];
    for (let i = 0; i < WAVEFORM_BAR_COUNT; i++) {
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
    return out.map((v) => v / peak);
  } finally {
    ctx.close().catch(() => {});
  }
}
