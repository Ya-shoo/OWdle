import { FFmpeg } from "@ffmpeg/ffmpeg";
import { fetchFile, toBlobURL } from "@ffmpeg/util";

// At v0.12+, `@ffmpeg/core` is single-threaded by default — ships just
// the .js + .wasm, no worker — so no SharedArrayBuffer / COOP-COEP setup
// is needed. (The legacy `@ffmpeg/core-st` package never made it past
// 0.11.x; the renamed `@ffmpeg/core-mt` is the multithreaded fork.)
// Slower than MT but irrelevant for the 1–3s clips we're slicing.
const CORE_BASE =
  "https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.10/dist/umd";

let instance: FFmpeg | null = null;
let pending: Promise<FFmpeg> | null = null;

export function loadFFmpeg(): Promise<FFmpeg> {
  if (instance) return Promise.resolve(instance);
  if (pending) return pending;

  pending = (async () => {
    const ffmpeg = new FFmpeg();
    await ffmpeg.load({
      coreURL: await toBlobURL(`${CORE_BASE}/ffmpeg-core.js`, "text/javascript"),
      wasmURL: await toBlobURL(
        `${CORE_BASE}/ffmpeg-core.wasm`,
        "application/wasm",
      ),
    });
    instance = ffmpeg;
    return ffmpeg;
  })();

  return pending;
}

const MOUNT_POINT = "/mnt";
const FALLBACK_NAME = "source.mp4";
let sourcePath: string = FALLBACK_NAME;

// Make the source video readable to ffmpeg without copying its entire body
// into WASM memory. WORKERFS exposes the user's File object as a virtual
// filesystem the ffmpeg worker can `read` lazily — so 20+ GB recordings
// work fine. We fall back to writeFile (which DOES copy) only if mount
// throws, which would mean the runtime doesn't support WORKERFS.
export async function writeVideo(file: File): Promise<void> {
  const ffmpeg = await loadFFmpeg();

  // Best-effort cleanup of whatever was loaded last — a different mount,
  // a stale fallback file, or both.
  try {
    await ffmpeg.unmount(MOUNT_POINT);
  } catch {
    // not mounted
  }
  try {
    await ffmpeg.deleteDir(MOUNT_POINT);
  } catch {
    // dir didn't exist
  }
  try {
    await ffmpeg.deleteFile(FALLBACK_NAME);
  } catch {
    // file didn't exist
  }

  try {
    await ffmpeg.createDir(MOUNT_POINT);
    await ffmpeg.mount(
      "WORKERFS" as unknown as Parameters<typeof ffmpeg.mount>[0],
      { files: [file] },
      MOUNT_POINT,
    );
    sourcePath = `${MOUNT_POINT}/${file.name}`;
    return;
  } catch {
    // WORKERFS unavailable — fall back, but only if the file is small
    // enough to fit in WASM memory (~2 GB ceiling on 32-bit cores).
  }

  if (file.size > 1.5 * 1024 * 1024 * 1024) {
    throw new Error(
      `Video is ${(file.size / 1024 / 1024 / 1024).toFixed(1)} GB and your browser doesn't support WORKERFS mounts. Compress or split the source first (see README).`,
    );
  }
  await ffmpeg.writeFile(FALLBACK_NAME, await fetchFile(file));
  sourcePath = FALLBACK_NAME;
}

// Kill the ffmpeg worker and forget the cached instance. The next
// loadFFmpeg() spins up a fresh worker (~200ms — the core is browser-
// cached), but the WASM heap starts at zero, which is the whole point.
// Use to bound memory across long export runs that otherwise drift into
// "memory access out of bounds" / exit code -1 territory.
export async function terminateFFmpeg(): Promise<void> {
  if (instance) {
    try {
      instance.terminate();
    } catch {
      // ignore
    }
  }
  instance = null;
  pending = null;
  sourcePath = FALLBACK_NAME;
}

export function isMemoryError(e: unknown): boolean {
  const msg = e instanceof Error ? e.message : String(e);
  return (
    msg.includes("memory access out of bounds") ||
    msg.includes("Out of memory") ||
    msg.includes("RuntimeError") ||
    msg.includes("FS error") ||
    msg.includes("Aborted")
  );
}

export type Range = { start: number; end: number };

// Sanitize stitched-range input before it hits ffmpeg's filter_complex.
// Inverted ranges (end < start) and overlaps both produce trim/atrim
// segments that the concat filter sits on indefinitely — no error, just
// a hung worker. Normalizing here means any caller (the labeler today,
// other tools tomorrow) gets the same defensive behavior for free.
function normalizeRanges(ranges: Range[]): Range[] {
  const valid: Range[] = [];
  for (const r of ranges) {
    const start = Math.min(r.start, r.end);
    const end = Math.max(r.start, r.end);
    if (end - start > 0.001) valid.push({ start, end });
  }
  if (valid.length === 0) return [];
  valid.sort((a, b) => a.start - b.start);
  const merged: Range[] = [{ ...valid[0] }];
  for (let i = 1; i < valid.length; i++) {
    const prev = merged[merged.length - 1];
    const curr = valid[i];
    // Touching (curr.start === prev.end) also merges — playing them as
    // two separately-trimmed clips through concat would be identical to
    // the union but pays the filter_complex cost for no reason.
    if (curr.start <= prev.end) {
      prev.end = Math.max(prev.end, curr.end);
    } else {
      merged.push({ ...curr });
    }
  }
  return merged;
}

// Slices [start, end) seconds from the loaded video and returns the audio
// as an MP3 byte array. We re-encode via libmp3lame so cuts are sample-
// accurate (audio frames are independently decodable, but MP4 demuxer
// granularity is per-frame ~21ms, which is plenty for SFX recognition).
export async function sliceAudio(
  start: number,
  end: number,
): Promise<Uint8Array> {
  const ffmpeg = await loadFFmpeg();
  const dur = Math.max(0.05, end - start);
  const out = `clip_${Math.random().toString(16).slice(2)}.mp3`;
  await ffmpeg.exec([
    "-ss",
    String(start),
    "-i",
    sourcePath,
    "-t",
    String(dur),
    "-vn",
    "-acodec",
    "libmp3lame",
    "-q:a",
    "5",
    out,
  ]);
  const data = (await ffmpeg.readFile(out)) as Uint8Array;
  await ffmpeg.deleteFile(out);
  return data;
}

// Slices [start, end) as a streaming-copy MP4 — no re-encode, so this is
// effectively a remux: instant, regardless of source length. The trade-off
// is that the cut start is keyframe-aligned (rounded down to the previous
// keyframe), so the output MP4 may include up to a few seconds of footage
// before the user's intended `start`. That's fine for the reveal-on-win
// use case (player sees a bit of context before the ability fires) and we
// avoid waiting on a slow x264 encode in WASM.
export async function sliceVideo(
  start: number,
  end: number,
): Promise<Uint8Array> {
  const ffmpeg = await loadFFmpeg();
  const dur = Math.max(0.05, end - start);
  const out = `clip_${Math.random().toString(16).slice(2)}.mp4`;
  await ffmpeg.exec([
    "-ss",
    String(start),
    "-i",
    sourcePath,
    "-t",
    String(dur),
    "-c",
    "copy",
    "-movflags",
    "+faststart",
    out,
  ]);
  const data = (await ffmpeg.readFile(out)) as Uint8Array;
  await ffmpeg.deleteFile(out);
  return data;
}

// Concatenate multiple non-contiguous ranges from the source into a single
// MP3. Each range is extracted independently with `-ss` input seek so the
// decoder only touches the bytes it needs — critical for multi-GB sources
// where reading from t=0 every time would be unbearably slow. Parts are
// then concat-demuxer'd together (lossless: same codec params throughout).
export async function sliceAudioRanges(
  rawRanges: Range[],
): Promise<Uint8Array> {
  const ranges = normalizeRanges(rawRanges);
  if (ranges.length === 0) {
    throw new Error("sliceAudioRanges: no valid ranges after normalization");
  }
  if (ranges.length === 1) {
    return sliceAudio(ranges[0].start, ranges[0].end);
  }
  const ffmpeg = await loadFFmpeg();
  const tag = Math.random().toString(16).slice(2);
  const partFiles: string[] = [];
  for (let i = 0; i < ranges.length; i++) {
    const r = ranges[i];
    const dur = Math.max(0.05, r.end - r.start);
    const part = `part_${tag}_${i}.mp3`;
    await ffmpeg.exec([
      "-ss",
      String(r.start),
      "-i",
      sourcePath,
      "-t",
      String(dur),
      "-vn",
      "-acodec",
      "libmp3lame",
      "-q:a",
      "5",
      part,
    ]);
    partFiles.push(part);
  }
  const manifestPath = `concat_${tag}.txt`;
  const manifest = partFiles.map((p) => `file '${p}'`).join("\n");
  await ffmpeg.writeFile(manifestPath, new TextEncoder().encode(manifest));
  const out = `clip_${tag}.mp3`;
  await ffmpeg.exec([
    "-f",
    "concat",
    "-safe",
    "0",
    "-i",
    manifestPath,
    "-c",
    "copy",
    out,
  ]);
  const data = (await ffmpeg.readFile(out)) as Uint8Array;
  for (const p of partFiles) {
    try {
      await ffmpeg.deleteFile(p);
    } catch {
      // ignore
    }
  }
  try {
    await ffmpeg.deleteFile(manifestPath);
  } catch {
    // ignore
  }
  await ffmpeg.deleteFile(out);
  return data;
}

// Concatenate multiple non-contiguous ranges from the source into a single
// MP4. Each range is re-encoded independently with `-ss` input seek (so we
// don't pay for decoding hundreds of seconds of unused source on a multi-
// GB recording the way a single filter_complex pass would), then concat-
// demuxer'd together — lossless because every part has identical codec
// params from the same encoder invocation.
export async function sliceVideoRanges(
  rawRanges: Range[],
): Promise<Uint8Array> {
  const ranges = normalizeRanges(rawRanges);
  if (ranges.length === 0) {
    throw new Error("sliceVideoRanges: no valid ranges after normalization");
  }
  if (ranges.length === 1) {
    return sliceVideo(ranges[0].start, ranges[0].end);
  }
  const ffmpeg = await loadFFmpeg();
  const tag = Math.random().toString(16).slice(2);
  const partFiles: string[] = [];
  for (let i = 0; i < ranges.length; i++) {
    const r = ranges[i];
    const dur = Math.max(0.05, r.end - r.start);
    const part = `part_${tag}_${i}.mp4`;
    await ffmpeg.exec([
      "-ss",
      String(r.start),
      "-i",
      sourcePath,
      "-t",
      String(dur),
      "-c:v",
      "libx264",
      "-preset",
      "ultrafast",
      "-c:a",
      "aac",
      "-b:a",
      "128k",
      "-movflags",
      "+faststart",
      part,
    ]);
    partFiles.push(part);
  }
  const manifestPath = `concat_${tag}.txt`;
  const manifest = partFiles.map((p) => `file '${p}'`).join("\n");
  await ffmpeg.writeFile(manifestPath, new TextEncoder().encode(manifest));
  const out = `clip_${tag}.mp4`;
  await ffmpeg.exec([
    "-f",
    "concat",
    "-safe",
    "0",
    "-i",
    manifestPath,
    "-c",
    "copy",
    "-movflags",
    "+faststart",
    out,
  ]);
  const data = (await ffmpeg.readFile(out)) as Uint8Array;
  for (const p of partFiles) {
    try {
      await ffmpeg.deleteFile(p);
    } catch {
      // ignore
    }
  }
  try {
    await ffmpeg.deleteFile(manifestPath);
  } catch {
    // ignore
  }
  await ffmpeg.deleteFile(out);
  return data;
}
