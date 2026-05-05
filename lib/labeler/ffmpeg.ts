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
// MP3 via filter_complex. atrim is sample-accurate, so boundaries between
// stitched ranges are seamless.
export async function sliceAudioRanges(
  ranges: Range[],
): Promise<Uint8Array> {
  if (ranges.length === 0) throw new Error("sliceAudioRanges: empty ranges");
  if (ranges.length === 1) {
    return sliceAudio(ranges[0].start, ranges[0].end);
  }
  const ffmpeg = await loadFFmpeg();
  const out = `clip_${Math.random().toString(16).slice(2)}.mp3`;
  const trims: string[] = [];
  const labels: string[] = [];
  for (let i = 0; i < ranges.length; i++) {
    const { start, end } = ranges[i];
    trims.push(
      `[0:a]atrim=start=${start.toFixed(3)}:end=${end.toFixed(3)},asetpts=PTS-STARTPTS[a${i}]`,
    );
    labels.push(`[a${i}]`);
  }
  const filter =
    trims.join(";") +
    `;${labels.join("")}concat=n=${ranges.length}:v=0:a=1[a]`;
  await ffmpeg.exec([
    "-i",
    sourcePath,
    "-filter_complex",
    filter,
    "-map",
    "[a]",
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

// Concatenate multiple non-contiguous ranges from the source into a single
// MP4. Unlike single-range sliceVideo (stream copy), stitching forces a
// re-encode so the boundary frames align cleanly. libx264 ultrafast keeps
// it bearable in WASM — expect ~1× realtime for short stitched clips.
export async function sliceVideoRanges(
  ranges: Range[],
): Promise<Uint8Array> {
  if (ranges.length === 0) throw new Error("sliceVideoRanges: empty ranges");
  if (ranges.length === 1) {
    return sliceVideo(ranges[0].start, ranges[0].end);
  }
  const ffmpeg = await loadFFmpeg();
  const out = `clip_${Math.random().toString(16).slice(2)}.mp4`;
  const trims: string[] = [];
  const labels: string[] = [];
  for (let i = 0; i < ranges.length; i++) {
    const { start, end } = ranges[i];
    trims.push(
      `[0:v]trim=start=${start.toFixed(3)}:end=${end.toFixed(3)},setpts=PTS-STARTPTS[v${i}]`,
    );
    trims.push(
      `[0:a]atrim=start=${start.toFixed(3)}:end=${end.toFixed(3)},asetpts=PTS-STARTPTS[ai${i}]`,
    );
    labels.push(`[v${i}][ai${i}]`);
  }
  const filter =
    trims.join(";") +
    `;${labels.join("")}concat=n=${ranges.length}:v=1:a=1[v][a]`;
  await ffmpeg.exec([
    "-i",
    sourcePath,
    "-filter_complex",
    filter,
    "-map",
    "[v]",
    "-map",
    "[a]",
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
    out,
  ]);
  const data = (await ffmpeg.readFile(out)) as Uint8Array;
  await ffmpeg.deleteFile(out);
  return data;
}
