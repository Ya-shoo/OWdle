"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import JSZip from "jszip";
import { HEROES } from "@/lib/heroes";
import {
  isMemoryError,
  loadFFmpeg,
  type Range,
  sliceAudioRanges,
  sliceVideoRanges,
  terminateFFmpeg,
  writeVideo,
} from "@/lib/labeler/ffmpeg";
import {
  getPresets,
  getUniversalExtras,
  slugify,
} from "@/lib/labeler/presets";

type Segment = {
  id: string;
  heroKey: string;
  heroName: string;
  label: string;
  slug: string;
  // Multiple non-contiguous ranges that get stitched together into one
  // clip on export. Single-range segments use a 1-element array.
  ranges: Range[];
};

type FfmpegState = "idle" | "loading" | "ready" | "error";

// The labeler powers two dev tools off one engine (timeline + ffmpeg +
// zip). `sound` is the original per-ability clip cutter; `melee` is the
// one-clip-per-hero variant for Melee mode. Everything mode-specific is
// funneled through MODE_CONFIG so the two never diverge in the UI or the
// slicing logic — only in labeling, output layout, and roster flow.
export type LabelerMode = "sound" | "melee";

type ModeConfig = {
  // Header title.
  title: string;
  // localStorage namespace — kept distinct so an in-progress melee pass
  // never clobbers in-progress sound work (and vice-versa).
  storageKey: string;
  // Top-level folder inside the exported zip + the public/ dir sync-*
  // unzips into.
  outputRoot: string;
  // Download filename stem. Distinct stems let `sync-clips` and
  // `sync-melee` glob their own archives without cross-contamination.
  zipPrefix: string;
  // Shown in the export footnote.
  syncCmd: string;
  // When set, the label is locked to this value (melee has exactly one
  // clip per hero, so there's nothing to type). null = free/preset labels.
  fixedLabel: string | null;
  // After committing a segment: advance to the next ability preset
  // (`ability`) or hop to the next hero still missing a clip (`hero`).
  advance: "ability" | "hero";
  // Enforce a single clip per hero — re-committing a hero overwrites its
  // prior segment instead of stacking a duplicate.
  oneClipPerHero: boolean;
};

const MODE_CONFIG: Record<LabelerMode, ModeConfig> = {
  sound: {
    title: "Sound labeler",
    storageKey: "owdle:labeler:segments:v3",
    outputRoot: "sounds",
    zipPrefix: "owdle-clips",
    syncCmd: "npm run sync-clips",
    fixedLabel: null,
    advance: "ability",
    oneClipPerHero: false,
  },
  melee: {
    title: "Melee labeler",
    storageKey: "owdle:labeler:melee:segments:v1",
    outputRoot: "melee",
    zipPrefix: "owdle-melee",
    syncCmd: "npm run sync-melee",
    fixedLabel: "melee",
    advance: "hero",
    oneClipPerHero: true,
  },
};

function totalDuration(ranges: Range[]): number {
  return ranges.reduce((sum, r) => sum + Math.max(0, r.end - r.start), 0);
}

const HERO_OPTIONS = HEROES.filter(
  (h) => h.abilities && h.abilities.length > 0,
)
  .map((h) => ({
    key: h.key,
    name: h.name,
  }))
  .sort((a, b) => a.name.localeCompare(b.name));

function fmtTime(t: number): string {
  if (!isFinite(t) || t < 0) return "—";
  const m = Math.floor(t / 60);
  const s = (t - m * 60).toFixed(2);
  return `${m}:${s.padStart(5, "0")}`;
}

export function Labeler({ mode = "sound" }: { mode?: LabelerMode }) {
  const cfg = MODE_CONFIG[mode];
  const [file, setFile] = useState<File | null>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [inTime, setInTime] = useState(0);
  const [outTime, setOutTime] = useState(0);
  const [heroKey, setHeroKey] = useState<string>(HERO_OPTIONS[0]?.key ?? "");
  const [label, setLabel] = useState<string>(
    () => cfg.fixedLabel ?? getPresets(HERO_OPTIONS[0]?.key ?? "")[0] ?? "",
  );
  const [segments, setSegments] = useState<Segment[]>([]);
  // Ranges that have been "stacked" but not yet committed as a segment.
  // The user is mid-construction: they've already marked some clean ranges
  // and is about to mark another one. Add Segment combines pending +
  // current in/out into one stitched segment.
  const [pendingRanges, setPendingRanges] = useState<Range[]>([]);
  // Horizontal zoom multiplier on the timeline. 1 = inner timeline matches
  // viewport width (no scroll). Higher values stretch the inner timeline
  // and reveal a horizontal scrollbar so the user can pan to specific
  // moments — essential for sub-second precision on a 25-min source.
  const [zoom, setZoom] = useState(1);
  const [ffmpegState, setFfmpegState] = useState<FfmpegState>("idle");
  const [videoLoading, setVideoLoading] = useState(false);
  const [videoLoaded, setVideoLoaded] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const timelineRef = useRef<HTMLDivElement | null>(null);
  const timelineScrollRef = useRef<HTMLDivElement | null>(null);

  const heroOption = useMemo(
    () => HERO_OPTIONS.find((h) => h.key === heroKey) ?? HERO_OPTIONS[0],
    [heroKey],
  );
  const presets = useMemo(() => getPresets(heroKey), [heroKey]);
  const extras = useMemo(() => getUniversalExtras(heroKey), [heroKey]);

  // When hero changes, jump to that hero's first preset unless the user is
  // already typing something hero-agnostic that they want to keep.
  useEffect(() => {
    // Melee's label is locked — switching heroes must not disturb it.
    if (cfg.fixedLabel) return;
    const lc = label.trim().toLowerCase();
    const currentInPresets = presets.some((p) => p.toLowerCase() === lc);
    const currentInExtras = extras.some((p) => p.toLowerCase() === lc);
    if (!currentInPresets && !currentInExtras && presets.length > 0) {
      setLabel(presets[0]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [heroKey]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(cfg.storageKey);
      if (raw) {
        setSegments(JSON.parse(raw));
        return;
      }
      // The v2 (start/end) schema only ever existed for sound; nothing to
      // migrate for melee.
      if (mode !== "sound") return;
      // Migrate from the v2 (start/end) schema if present, then drop the
      // old key so subsequent loads are clean.
      const v2 = localStorage.getItem("owdle:labeler:segments:v2");
      if (v2) {
        const parsed = JSON.parse(v2) as Array<
          Segment & { start?: number; end?: number }
        >;
        const migrated: Segment[] = parsed.map((s) => ({
          id: s.id,
          heroKey: s.heroKey,
          heroName: s.heroName,
          label: s.label,
          slug: s.slug,
          ranges: s.ranges
            ? s.ranges
            : [{ start: s.start ?? 0, end: s.end ?? 0 }],
        }));
        setSegments(migrated);
        localStorage.removeItem("owdle:labeler:segments:v2");
      }
    } catch {
      // ignore
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(cfg.storageKey, JSON.stringify(segments));
    } catch {
      // ignore (quota/private mode)
    }
  }, [segments, cfg.storageKey]);

  useEffect(() => {
    if (ffmpegState !== "idle") return;
    setFfmpegState("loading");
    loadFFmpeg()
      .then(() => setFfmpegState("ready"))
      .catch((e) => {
        setFfmpegState("error");
        setError(`ffmpeg load failed: ${e instanceof Error ? e.message : e}`);
      });
  }, [ffmpegState]);

  useEffect(() => {
    return () => {
      if (videoUrl) URL.revokeObjectURL(videoUrl);
    };
  }, [videoUrl]);

  const handleFile = async (f: File) => {
    setError(null);
    setFile(f);
    if (videoUrl) URL.revokeObjectURL(videoUrl);
    setVideoUrl(URL.createObjectURL(f));
    setVideoLoaded(false);
    setVideoLoading(true);
    setInTime(0);
    setOutTime(0);
    setCurrentTime(0);

    try {
      await loadFFmpeg();
      await writeVideo(f);
      setVideoLoaded(true);
    } catch (e) {
      setError(`Failed to ingest video: ${e instanceof Error ? e.message : e}`);
    } finally {
      setVideoLoading(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const f = e.dataTransfer.files[0];
    if (!f) return;
    if (!f.type.startsWith("video/")) {
      setError("Drop a video file (MP4, MOV, WebM).");
      return;
    }
    handleFile(f);
  };

  const dragHandle =
    (which: "in" | "out" | "seek") => (e: React.PointerEvent) => {
      e.preventDefault();
      const tl = timelineRef.current;
      if (!tl || !duration) return;
      const rect = tl.getBoundingClientRect();
      // Capture the OPPOSITE handle's value at drag start so we can clamp
      // against it without re-reading state mid-drag.
      const opposite = which === "in" ? outTime : inTime;
      const update = (clientX: number) => {
        const ratio = Math.max(
          0,
          Math.min(1, (clientX - rect.left) / rect.width),
        );
        const t = ratio * duration;
        if (which === "in") {
          setInTime(Math.min(t, opposite));
        } else if (which === "out") {
          setOutTime(Math.max(t, opposite));
        } else {
          if (videoRef.current) videoRef.current.currentTime = t;
        }
      };
      update(e.clientX);
      const onMove = (ev: PointerEvent) => update(ev.clientX);
      const onUp = () => {
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
      };
      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
    };

  // Alt + wheel zooms the timeline, anchored to the cursor so the moment
  // under the pointer stays under the pointer through the zoom. Without
  // Alt the wheel does its normal job (page scroll, horizontal pan when
  // the timeline overflows).
  const onTimelineWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    if (!e.altKey) return;
    e.preventDefault();
    const wrap = timelineScrollRef.current;
    if (!wrap) return;
    const rect = wrap.getBoundingClientRect();
    const cursorX = e.clientX - rect.left;
    const innerCursorX = wrap.scrollLeft + cursorX;
    const ratio = wrap.scrollWidth > 0 ? innerCursorX / wrap.scrollWidth : 0;
    const factor = e.deltaY < 0 ? 1.2 : 1 / 1.2;
    setZoom((z) => {
      const next = Math.max(1, Math.min(200, z * factor));
      // After re-render, scroll so the same source-time stays under the
      // pointer. requestAnimationFrame lets the new layout settle first.
      requestAnimationFrame(() => {
        const w = timelineScrollRef.current;
        if (!w) return;
        const newInnerCursorX = ratio * w.scrollWidth;
        w.scrollLeft = newInnerCursorX - cursorX;
      });
      return next;
    });
  };

  const resetZoom = () => {
    setZoom(1);
    if (timelineScrollRef.current) timelineScrollRef.current.scrollLeft = 0;
  };

  const previewClip = () => {
    const v = videoRef.current;
    if (!v || outTime <= inTime) return;
    v.currentTime = inTime;
    v.play();
    const ms = (outTime - inTime) * 1000;
    window.setTimeout(() => {
      try {
        v.pause();
      } catch {
        // ignore
      }
    }, ms);
  };

  const stackRange = () => {
    if (outTime <= inTime) {
      setError("Mark a range with In/Out before stacking it.");
      return;
    }
    setPendingRanges((rs) => [...rs, { start: inTime, end: outTime }]);
    setInTime(0);
    setOutTime(0);
    setError(null);
  };

  const removePendingRange = (idx: number) => {
    setPendingRanges((rs) => rs.filter((_, i) => i !== idx));
  };

  const clearPending = () => {
    setPendingRanges([]);
  };

  const addSegment = () => {
    if (!heroOption) return;
    const trimmed = cfg.fixedLabel ?? label.trim();
    if (!trimmed) {
      setError("Label is required.");
      return;
    }
    const slug = slugify(trimmed);
    if (!slug) {
      setError("Label needs at least one letter or number.");
      return;
    }
    // Combine: any pending stacked ranges + the current in/out (if non-zero
    // span). Sort chronologically so the stitched clip plays in source-
    // video order regardless of the order ranges were stacked.
    const ranges: Range[] = [...pendingRanges];
    if (outTime > inTime) ranges.push({ start: inTime, end: outTime });
    if (ranges.length === 0) {
      setError("Mark at least one In/Out range first.");
      return;
    }
    ranges.sort((a, b) => a.start - b.start);

    const seg: Segment = {
      id: `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
      heroKey: heroOption.key,
      heroName: heroOption.name,
      label: trimmed,
      slug,
      ranges,
    };
    // One-clip-per-hero (melee): re-committing a hero overwrites its prior
    // segment rather than stacking a duplicate. The resulting set also
    // drives the "next undone hero" jump below, so compute it eagerly
    // instead of leaning on the async state update.
    const nextSegments = cfg.oneClipPerHero
      ? [...segments.filter((x) => x.heroKey !== heroOption.key), seg]
      : [...segments, seg];
    setSegments(nextSegments);
    setPendingRanges([]);
    setInTime(0);
    setOutTime(0);
    setError(null);

    if (cfg.advance === "hero") {
      // Hop to the next hero still missing a clip (wrapping), so a full
      // roster pass is just mark → Add, mark → Add.
      const done = new Set(nextSegments.map((x) => x.heroKey));
      const start = HERO_OPTIONS.findIndex((h) => h.key === heroOption.key);
      for (let step = 1; step <= HERO_OPTIONS.length; step++) {
        const cand = HERO_OPTIONS[(start + step) % HERO_OPTIONS.length];
        if (!done.has(cand.key)) {
          setHeroKey(cand.key);
          break;
        }
      }
      return;
    }

    const idx = presets.findIndex(
      (p) => p.toLowerCase() === trimmed.toLowerCase(),
    );
    if (idx >= 0 && idx < presets.length - 1) {
      setLabel(presets[idx + 1]);
    } else if (idx === presets.length - 1) {
      const i = HERO_OPTIONS.findIndex((h) => h.key === heroOption.key);
      if (i >= 0 && i < HERO_OPTIONS.length - 1) {
        setHeroKey(HERO_OPTIONS[i + 1].key);
      }
    }
  };

  const removeSegment = (id: string) => {
    setSegments((s) => s.filter((x) => x.id !== id));
  };

  const recallSegment = (s: Segment) => {
    setHeroKey(s.heroKey);
    setLabel(s.label);
    if (s.ranges.length === 0) return;
    // Last range becomes the active editable in/out; everything before it
    // goes back into the pending stack so the stitched layout is faithfully
    // reconstructed and the user can re-drag the most recent range.
    const last = s.ranges[s.ranges.length - 1];
    const earlier = s.ranges.slice(0, -1);
    setPendingRanges(earlier);
    setInTime(last.start);
    setOutTime(last.end);
    if (videoRef.current) videoRef.current.currentTime = last.start;
  };

  const clearAll = () => {
    if (segments.length === 0) return;
    if (!window.confirm(`Discard all ${segments.length} segments?`)) return;
    setSegments([]);
  };

  const exportAll = async () => {
    if (!file || ffmpegState !== "ready" || !videoLoaded) {
      setError("Drop a video and wait for ffmpeg to finish loading.");
      return;
    }
    if (segments.length === 0) {
      setError("No segments to export.");
      return;
    }
    setExporting(true);
    setExportProgress(0);
    setError(null);

    // Split the export into many small ZIPs. JSZip + JS heap can't hold
    // hundreds of MP4 clips at once — at OBS-quality bitrates a single
    // 200-clip archive blows past the ~2 GB ArrayBuffer ceiling and
    // generateAsync() fails with "ArrayBuffer allocation failed". A
    // batch size of 10 keeps each archive under ~100 MB on typical
    // recordings. The sync-clips script unzips them all at once.
    const CLIPS_PER_ZIP = 10;
    // Hard ceiling per clip so a single hang can't freeze the whole
    // export. ffmpeg.wasm sometimes wedges silently (no error, no
    // progress) — this turns that into a recoverable error that the
    // skip-and-log path can deal with. Tuned generously: even a
    // pathological re-encode of a multi-second stitched clip from a
    // multi-GB source should finish well under this in practice.
    const CLIP_TIMEOUT_MS = 90_000;

    const refreshFFmpeg = async () => {
      await terminateFFmpeg();
      await loadFFmpeg();
      if (file) await writeVideo(file);
    };

    try {
      let zip = new JSZip();
      let root = zip.folder(cfg.outputRoot);
      if (!root) throw new Error("Couldn't create zip folder");
      let inCurrentZip = 0;
      let zipIndex = 1;
      const totalZips = Math.ceil(segments.length / CLIPS_PER_ZIP);
      const failures: { index: number; id: string; reason: string }[] = [];

      const flushZip = async () => {
        if (inCurrentZip === 0) return;
        const blob = await zip.generateAsync({
          type: "blob",
          // Stream copy is already compressed; deflating again wastes
          // CPU and memory for ~no gain on MP4/MP3 payloads.
          compression: "STORE",
        });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `${cfg.zipPrefix}-${String(zipIndex).padStart(2, "0")}.zip`;
        a.click();
        URL.revokeObjectURL(url);
        zip = new JSZip();
        root = zip.folder(cfg.outputRoot);
        if (!root) throw new Error("Couldn't create zip folder");
        inCurrentZip = 0;
        zipIndex++;
      };

      console.log(
        `[export] starting: ${segments.length} clips → ${totalZips} zip(s)`,
      );

      for (let i = 0; i < segments.length; i++) {
        const s = segments[i];
        // Melee is flat — melee/<hero>.{mp4,mp3}, one clip per hero. Sound
        // nests — sounds/<hero>/<slug>.{mp4,mp3}.
        const folder = mode === "melee" ? root : root.folder(s.heroKey);
        if (!folder) continue;
        const baseName = mode === "melee" ? s.heroKey : s.slug;

        const id = `${s.heroKey}/${s.slug}`;
        const totalDur = totalDuration(s.ranges).toFixed(2);
        const rangeNote =
          s.ranges.length === 1
            ? `1 range, ${totalDur}s`
            : `${s.ranges.length} stitched, ${totalDur}s`;
        console.log(
          `[export] ${i + 1}/${segments.length} ${id} (${rangeNote})`,
        );
        const startMs = performance.now();

        // Race the slice against a hard timeout. ffmpeg.wasm hangs
        // silently in some edge cases — a Promise.race lets us treat
        // that as an error we can retry-then-skip rather than an
        // indefinite freeze. The retry covers memory errors AND
        // timeouts (one fresh worker often unsticks both).
        let attempts = 0;
        let succeeded = false;
        let lastErr: unknown = null;
        while (attempts < 2) {
          try {
            await Promise.race([
              (async () => {
                const mp4 = await sliceVideoRanges(s.ranges);
                folder.file(`${baseName}.mp4`, mp4);
                const mp3 = await sliceAudioRanges(s.ranges);
                folder.file(`${baseName}.mp3`, mp3);
              })(),
              new Promise<never>((_, reject) =>
                setTimeout(
                  () =>
                    reject(
                      new Error(
                        `clip exceeded ${CLIP_TIMEOUT_MS / 1000}s timeout`,
                      ),
                    ),
                  CLIP_TIMEOUT_MS,
                ),
              ),
            ]);
            succeeded = true;
            break;
          } catch (e) {
            lastErr = e;
            const isTimeout =
              e instanceof Error && e.message.includes("timeout");
            if (attempts < 1 && (isMemoryError(e) || isTimeout)) {
              attempts++;
              console.warn(
                `[export]   retry after ${isTimeout ? "timeout" : "memory error"}: refreshing ffmpeg`,
              );
              await refreshFFmpeg();
              continue;
            }
            break;
          }
        }

        if (succeeded) {
          const elapsed = Math.round(performance.now() - startMs);
          console.log(`[export]   ✓ ${elapsed}ms`);
          inCurrentZip++;
        } else {
          const reason =
            lastErr instanceof Error ? lastErr.message : String(lastErr);
          console.error(`[export]   ✗ skipped: ${reason}`);
          failures.push({ index: i + 1, id, reason });
          // After a skipped clip the worker may be in a bad state
          // (especially after a timeout). Refresh proactively so the
          // next clip starts clean.
          try {
            await refreshFFmpeg();
          } catch {
            // ignore — next clip will try anyway
          }
        }
        setExportProgress((i + 1) / segments.length);

        if (inCurrentZip >= CLIPS_PER_ZIP) {
          await flushZip();
        }
      }

      await flushZip();
      const ok = segments.length - failures.length;
      console.log(
        `[export] done: ${ok}/${segments.length} clips across ${zipIndex - 1} zip(s)` +
          (failures.length > 0
            ? `, ${failures.length} skipped — see warnings above`
            : ""),
      );
      if (failures.length > 0) {
        console.table(failures);
      }
      if (failures.length > 0) {
        const list = failures
          .slice(0, 5)
          .map((f) => `#${f.index} ${f.id}`)
          .join(", ");
        const more = failures.length > 5 ? ` (+${failures.length - 5} more)` : "";
        setError(
          `Exported ${ok}/${segments.length} clips. Skipped: ${list}${more}. See console for full list and reasons.`,
        );
      } else if (totalZips > 1) {
        // Brief one-off feedback so the user knows to expect multiple
        // downloads. Not an error; clears on the next user action.
        setError(
          `Exported ${segments.length} clips across ${zipIndex - 1} zip files. Run "${cfg.syncCmd}" — it globs for ${cfg.zipPrefix}-*.zip.`,
        );
      }
    } catch (e) {
      setError(`Export failed: ${e instanceof Error ? e.message : e}`);
    } finally {
      setExporting(false);
    }
  };

  // Stable refs so the global hotkey effect can reach the latest values
  // without re-binding the listener on every keystroke.
  const stateRef = useRef({
    duration,
    addSegment,
    previewClip,
    stackRange,
  });
  stateRef.current = {
    duration,
    addSegment,
    previewClip,
    stackRange,
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (
        t &&
        ["INPUT", "SELECT", "TEXTAREA"].includes(t.tagName)
      ) {
        return;
      }
      const v = videoRef.current;
      if (e.code === "Space") {
        e.preventDefault();
        if (v) {
          if (v.paused) v.play();
          else v.pause();
        }
      } else if (e.key === "i" || e.key === "I") {
        e.preventDefault();
        if (v) setInTime(v.currentTime);
      } else if (e.key === "o" || e.key === "O") {
        e.preventDefault();
        if (v) setOutTime(v.currentTime);
      } else if (e.key === "s" || e.key === "S") {
        e.preventDefault();
        stateRef.current.stackRange();
      } else if (e.key === "Enter") {
        e.preventDefault();
        stateRef.current.addSegment();
      } else if (e.key === "p" || e.key === "P") {
        e.preventDefault();
        stateRef.current.previewClip();
      } else if (e.key === "ArrowLeft") {
        if (v) {
          v.currentTime = Math.max(
            0,
            v.currentTime - (e.shiftKey ? 1 : 0.1),
          );
        }
      } else if (e.key === "ArrowRight") {
        if (v) {
          v.currentTime = Math.min(
            stateRef.current.duration,
            v.currentTime + (e.shiftKey ? 1 : 0.1),
          );
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Heroes with a committed clip — melee shows this as roster progress and
  // marks done heroes in the picker so a full-roster pass is legible.
  const doneHeroKeys = useMemo(
    () => new Set(segments.map((s) => s.heroKey)),
    [segments],
  );

  const inRatio = duration ? inTime / duration : 0;
  const outRatio = duration ? outTime / duration : 0;
  const playRatio = duration ? currentTime / duration : 0;

  const ffmpegBadge =
    ffmpegState === "ready"
      ? "text-correct"
      : ffmpegState === "error"
        ? "text-far"
        : "text-ink-faint";

  return (
    <main
      className="min-h-screen bg-bg text-ink"
      onDrop={!videoUrl ? handleDrop : undefined}
      onDragOver={(e) => e.preventDefault()}
    >
      <div className="mx-auto max-w-[1800px] px-4 py-6 sm:px-6 sm:py-10 lg:px-8">
        <header className="mb-6 flex items-baseline justify-between gap-4">
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[0.24em] text-info">
              OWdle dev tool
            </p>
            <h1 className="mt-1 font-display text-3xl text-ink sm:text-4xl">
              {cfg.title}
            </h1>
          </div>
          <span
            className={`font-mono text-[10px] uppercase tracking-[0.18em] ${ffmpegBadge}`}
          >
            ffmpeg · {ffmpegState}
          </span>
        </header>

        {error && (
          <div className="mb-4 rounded-(--radius-card) border border-far/40 bg-far/10 px-4 py-3">
            <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-far">
              {error}
            </p>
          </div>
        )}

        {!videoUrl ? (
          <div
            className="grid h-72 place-items-center rounded-(--radius-card) border-2 border-dashed border-line bg-inset/30 text-center"
            onDrop={handleDrop}
            onDragOver={(e) => e.preventDefault()}
          >
            <div>
              <p className="font-mono text-xs uppercase tracking-[0.2em] text-ink-soft">
                Drop a video here
              </p>
              <label className="mt-3 inline-block cursor-pointer rounded-(--radius-card) border border-line px-4 py-2 font-mono text-[10px] uppercase tracking-[0.2em] text-ink transition-colors hover:border-accent hover:text-accent">
                or choose file
                <input
                  type="file"
                  accept="video/*"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) handleFile(f);
                  }}
                />
              </label>
              <p className="mt-3 font-mono text-[10px] uppercase tracking-[0.2em] text-ink-faint">
                MP4, MOV, WebM · stays local · processed in-browser
              </p>
            </div>
          </div>
        ) : (
          <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
            <div className="flex min-w-0 flex-col gap-4">
              <div className="relative">
                <video
                  ref={videoRef}
                  src={videoUrl}
                  className="max-h-[55vh] w-full rounded-(--radius-card) bg-black object-contain"
                  controls
                  playsInline
                  onLoadedMetadata={(e) => {
                    const v = e.currentTarget;
                    setDuration(v.duration);
                    if (outTime === 0) {
                      setOutTime(Math.min(2, v.duration));
                    }
                  }}
                  onTimeUpdate={(e) =>
                    setCurrentTime(e.currentTarget.currentTime)
                  }
                />
                {videoLoading && (
                  <div className="absolute inset-0 flex items-center justify-center rounded-(--radius-card) bg-bg/70 font-mono text-[10px] uppercase tracking-[0.2em] text-ink-soft">
                    Ingesting into ffmpeg…
                  </div>
                )}
              </div>

              <div>
                <div
                  ref={timelineScrollRef}
                  onWheel={onTimelineWheel}
                  className="relative w-full overflow-x-auto overflow-y-hidden rounded-(--radius-card) [scrollbar-color:var(--accent)_transparent] [scrollbar-width:thin]"
                >
                <div
                  ref={timelineRef}
                  onPointerDown={dragHandle("seek")}
                  style={{ width: `${zoom * 100}%` }}
                  className="relative h-24 cursor-pointer overflow-hidden rounded-(--radius-card) border border-line bg-inset/40 select-none"
                >
                  {duration > 0 &&
                    segments.flatMap((s) =>
                      s.ranges.map((r, ri) => (
                        <div
                          key={`${s.id}-${ri}`}
                          className="pointer-events-none absolute top-1 bottom-1 rounded-sm bg-correct/35"
                          style={{
                            left: `${(r.start / duration) * 100}%`,
                            width: `${Math.max(0.5, ((r.end - r.start) / duration) * 100)}%`,
                          }}
                          title={`${s.heroName} · ${s.label}${s.ranges.length > 1 ? ` (range ${ri + 1}/${s.ranges.length})` : ""}`}
                        />
                      )),
                    )}
                  {/* pending stacked ranges — soft accent so they read as
                      "queued for the segment about to be added" rather than
                      "saved" (green) or "currently dragging" (orange). */}
                  {duration > 0 &&
                    pendingRanges.map((r, i) => (
                      <div
                        key={`pending-${i}`}
                        className="pointer-events-none absolute top-1 bottom-1 rounded-sm border border-accent-soft/60 bg-accent-soft/25"
                        style={{
                          left: `${(r.start / duration) * 100}%`,
                          width: `${Math.max(0.5, ((r.end - r.start) / duration) * 100)}%`,
                        }}
                        title={`Pending range ${i + 1}: ${fmtTime(r.start)} → ${fmtTime(r.end)}`}
                      />
                    ))}
                  {duration > 0 && outTime > inTime && (
                    <div
                      className="pointer-events-none absolute top-0 bottom-0 bg-accent/30"
                      style={{
                        left: `${inRatio * 100}%`,
                        width: `${(outRatio - inRatio) * 100}%`,
                      }}
                    />
                  )}
                  {duration > 0 && (
                    <>
                      <div
                        onPointerDown={(e) => {
                          e.stopPropagation();
                          dragHandle("in")(e);
                        }}
                        className="absolute top-0 bottom-0 -ml-2 flex w-4 cursor-ew-resize items-center justify-center bg-accent shadow-[0_0_0_1px_var(--bg-default)]"
                        style={{ left: `${inRatio * 100}%` }}
                        title={`In: ${fmtTime(inTime)}`}
                      >
                        <span
                          aria-hidden
                          className="h-1/2 w-px bg-on-accent/70"
                        />
                      </div>
                      <div
                        onPointerDown={(e) => {
                          e.stopPropagation();
                          dragHandle("out")(e);
                        }}
                        className="absolute top-0 bottom-0 -ml-2 flex w-4 cursor-ew-resize items-center justify-center bg-accent shadow-[0_0_0_1px_var(--bg-default)]"
                        style={{ left: `${outRatio * 100}%` }}
                        title={`Out: ${fmtTime(outTime)}`}
                      >
                        <span
                          aria-hidden
                          className="h-1/2 w-px bg-on-accent/70"
                        />
                      </div>
                      <div
                        className="pointer-events-none absolute top-0 bottom-0 w-0.5 bg-info/80"
                        style={{ left: `${playRatio * 100}%` }}
                      />
                    </>
                  )}
                </div>
                </div>
                <div className="mt-2 flex flex-wrap items-baseline justify-between gap-2 font-mono text-[10px] uppercase tracking-[0.18em]">
                  <span className="text-ink-faint">0:00</span>
                  <span className="text-info">
                    In <span className="text-ink">{fmtTime(inTime)}</span>{" "}
                    · Out{" "}
                    <span className="text-ink">{fmtTime(outTime)}</span> ·{" "}
                    <span className="text-accent-soft">
                      {Math.max(0, outTime - inTime).toFixed(2)}s
                    </span>
                    {pendingRanges.length > 0 && (
                      <span className="ml-2 text-accent-soft">
                        + {pendingRanges.length} stacked ={" "}
                        <span className="text-accent">
                          {(
                            totalDuration(pendingRanges) +
                            Math.max(0, outTime - inTime)
                          ).toFixed(2)}
                          s
                        </span>{" "}
                        total
                      </span>
                    )}
                  </span>
                  <span className="flex items-baseline gap-2">
                    <button
                      type="button"
                      onClick={resetZoom}
                      disabled={zoom === 1}
                      title="Alt + scroll on the timeline to zoom; click to reset"
                      className="rounded-full border border-line px-2 py-0.5 font-mono text-[10px] tracking-[0.16em] text-ink-soft transition-colors hover:border-accent hover:text-accent disabled:cursor-default disabled:opacity-50 disabled:hover:border-line disabled:hover:text-ink-soft"
                    >
                      {zoom.toFixed(zoom < 10 ? 1 : 0)}×
                    </button>
                    <span className="text-ink-faint">{fmtTime(duration)}</span>
                  </span>
                </div>
                {pendingRanges.length > 0 && (
                  <div className="mt-2 flex flex-wrap items-center gap-1.5">
                    <span className="font-mono text-[9px] uppercase tracking-[0.2em] text-ink-faint">
                      Stacked:
                    </span>
                    {pendingRanges.map((r, i) => (
                      <span
                        key={i}
                        className="inline-flex items-center gap-1 rounded-full border border-accent-soft/40 bg-accent-soft/10 px-2 py-0.5 font-mono text-[10px] tracking-[0.14em] text-accent-soft"
                      >
                        {fmtTime(r.start)} → {fmtTime(r.end)}
                        <button
                          type="button"
                          onClick={() => removePendingRange(i)}
                          aria-label={`Remove range ${i + 1}`}
                          className="text-accent-soft/70 hover:text-far"
                        >
                          ×
                        </button>
                      </span>
                    ))}
                    <button
                      type="button"
                      onClick={clearPending}
                      className="ml-1 font-mono text-[9px] uppercase tracking-[0.2em] text-ink-faint hover:text-far"
                    >
                      clear
                    </button>
                  </div>
                )}
              </div>

              <div className="grid gap-3 sm:grid-cols-[200px_1fr]">
                <label className="flex flex-col gap-1">
                  <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-ink-faint">
                    Hero
                  </span>
                  <select
                    value={heroKey}
                    onChange={(e) => setHeroKey(e.target.value)}
                    className="rounded-(--radius-card) border border-line bg-inset/60 px-3 py-2 text-sm text-ink outline-none focus:border-accent"
                  >
                    {HERO_OPTIONS.map((h) => (
                      <option key={h.key} value={h.key}>
                        {mode === "melee" && doneHeroKeys.has(h.key)
                          ? `✓ ${h.name}`
                          : h.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="flex flex-col gap-1">
                  <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-ink-faint">
                    Label{" "}
                    <span className="text-ink-faint/70 normal-case tracking-normal">
                      {cfg.fixedLabel
                        ? "(locked — one melee clip per hero)"
                        : "(becomes the filename)"}
                    </span>
                  </span>
                  <input
                    type="text"
                    value={label}
                    disabled={!!cfg.fixedLabel}
                    onChange={(e) => setLabel(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        e.currentTarget.blur();
                        addSegment();
                      }
                    }}
                    placeholder="e.g., Biotic Rifle, Scoped Fire"
                    className="rounded-(--radius-card) border border-line bg-inset/60 px-3 py-2 text-sm text-ink outline-none focus:border-accent disabled:cursor-not-allowed disabled:opacity-60"
                  />
                  <span className="mt-0.5 font-mono text-[9px] tracking-[0.18em] text-ink-faint">
                    {mode === "melee"
                      ? `→ /melee/${heroKey}.{mp4,mp3}`
                      : `→ /sounds/${heroKey}/${slugify(label) || "—"}.{mp4,mp3}`}
                  </span>
                </label>
              </div>

              {!cfg.fixedLabel && (presets.length > 0 || extras.length > 0) && (
                <div className="flex flex-col gap-2">
                  <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-ink-faint">
                    {heroOption?.name} presets
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {presets.map((p) => {
                      const active =
                        label.trim().toLowerCase() === p.toLowerCase();
                      return (
                        <button
                          key={p}
                          type="button"
                          onClick={() => setLabel(p)}
                          className={
                            "rounded-full border px-3 py-1 font-mono text-[10px] uppercase tracking-[0.16em] transition-colors " +
                            (active
                              ? "border-accent bg-accent/15 text-accent"
                              : "border-line text-ink-soft hover:border-accent/60 hover:text-accent-soft")
                          }
                        >
                          {p}
                        </button>
                      );
                    })}
                    {extras.map((p) => {
                      const active =
                        label.trim().toLowerCase() === p.toLowerCase();
                      return (
                        <button
                          key={p}
                          type="button"
                          onClick={() => setLabel(p)}
                          className={
                            "rounded-full border border-dashed px-3 py-1 font-mono text-[10px] uppercase tracking-[0.16em] transition-colors " +
                            (active
                              ? "border-accent bg-accent/15 text-accent"
                              : "border-line/70 text-ink-faint hover:border-accent/60 hover:text-accent-soft")
                          }
                          title="Generic preset"
                        >
                          {p}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => {
                    const v = videoRef.current;
                    if (v) setInTime(v.currentTime);
                  }}
                  className="rounded-(--radius-card) border border-line px-3 py-2 font-mono text-[10px] uppercase tracking-[0.2em] transition-colors hover:border-accent hover:text-accent"
                >
                  Set in (I)
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const v = videoRef.current;
                    if (v) setOutTime(v.currentTime);
                  }}
                  className="rounded-(--radius-card) border border-line px-3 py-2 font-mono text-[10px] uppercase tracking-[0.2em] transition-colors hover:border-accent hover:text-accent"
                >
                  Set out (O)
                </button>
                <button
                  type="button"
                  onClick={previewClip}
                  className="rounded-(--radius-card) border border-line px-3 py-2 font-mono text-[10px] uppercase tracking-[0.2em] transition-colors hover:border-accent hover:text-accent"
                >
                  Preview (P)
                </button>
                <button
                  type="button"
                  onClick={stackRange}
                  disabled={outTime <= inTime}
                  title="Save the current In/Out as a stacked range, then mark another. Add Segment combines all stacked ranges into one stitched clip."
                  className="rounded-(--radius-card) border border-accent-soft/60 px-3 py-2 font-mono text-[10px] uppercase tracking-[0.2em] text-accent-soft transition-colors hover:bg-accent-soft/10 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  + Stack range (S)
                </button>
                <button
                  type="button"
                  onClick={addSegment}
                  className="rounded-(--radius-card) bg-accent px-4 py-2 font-mono text-[10px] uppercase tracking-[0.2em] text-on-accent transition-opacity hover:opacity-90"
                >
                  Add segment (Enter)
                </button>
                <label className="ml-auto cursor-pointer rounded-(--radius-card) border border-line px-3 py-2 font-mono text-[10px] uppercase tracking-[0.2em] transition-colors hover:border-accent hover:text-accent">
                  Replace video
                  <input
                    type="file"
                    accept="video/*"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) handleFile(f);
                    }}
                  />
                </label>
              </div>

              <details className="rounded-(--radius-card) border border-line bg-inset/30 p-3">
                <summary className="cursor-pointer font-mono text-[10px] uppercase tracking-[0.2em] text-ink-soft">
                  Hotkeys
                </summary>
                <ul className="mt-2 grid grid-cols-2 gap-1 font-mono text-[10px] uppercase tracking-[0.16em] text-ink-faint">
                  <li>Space — play / pause</li>
                  <li>I / O — set in / out at playhead</li>
                  <li>S — stack current in/out as a range</li>
                  <li>Enter — add segment (committing all stacks)</li>
                  <li>P — preview clip</li>
                  <li>← / → — scrub 0.1s (Shift = 1s)</li>
                  <li>Alt + scroll — zoom timeline at cursor</li>
                  <li>Shift + scroll — pan zoomed timeline</li>
                </ul>
              </details>
            </div>

            <aside className="flex h-fit flex-col gap-3 rounded-(--radius-card) border border-line bg-inset/40 p-4">
              <div className="flex items-baseline justify-between">
                <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-info">
                  {mode === "melee" ? "Heroes" : "Segments"}
                </p>
                <span className="font-mono text-[10px] tracking-[0.18em] text-ink-faint">
                  {mode === "melee"
                    ? `${doneHeroKeys.size}/${HERO_OPTIONS.length}`
                    : segments.length}
                </span>
              </div>

              {segments.length === 0 ? (
                <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-faint">
                  None yet. Drag the orange handles to mark a clip, label it,
                  hit Add.
                </p>
              ) : (
                <ul className="flex max-h-[50vh] flex-col gap-2 overflow-y-auto pr-1">
                  {segments.map((s) => (
                    <li
                      key={s.id}
                      className="flex items-start justify-between gap-2 rounded-sm border border-line/60 px-2 py-1.5 transition-colors hover:border-accent/40"
                    >
                      <button
                        type="button"
                        onClick={() => recallSegment(s)}
                        className="flex-1 text-left"
                      >
                        <div className="font-mono text-[11px] text-ink">
                          {s.heroName} ·{" "}
                          <span className="text-accent-soft">{s.label}</span>
                          {s.ranges.length > 1 && (
                            <span className="ml-1 rounded-sm bg-accent-soft/15 px-1 font-mono text-[9px] tracking-[0.14em] text-accent-soft">
                              ×{s.ranges.length}
                            </span>
                          )}
                        </div>
                        <div className="mt-0.5 font-mono text-[10px] tracking-[0.14em] text-ink-faint">
                          {s.ranges.length === 1
                            ? `${fmtTime(s.ranges[0].start)} → ${fmtTime(s.ranges[0].end)}`
                            : `stitched ${s.ranges.length}`}
                          {" · "}
                          {totalDuration(s.ranges).toFixed(2)}s
                        </div>
                      </button>
                      <button
                        type="button"
                        onClick={() => removeSegment(s.id)}
                        className="font-mono text-base leading-none text-ink-faint hover:text-far"
                        aria-label="Delete segment"
                      >
                        ×
                      </button>
                    </li>
                  ))}
                </ul>
              )}

              <button
                type="button"
                disabled={
                  exporting ||
                  segments.length === 0 ||
                  ffmpegState !== "ready" ||
                  !videoLoaded
                }
                onClick={exportAll}
                className="rounded-(--radius-card) bg-accent px-4 py-2 font-mono text-[10px] uppercase tracking-[0.2em] text-on-accent transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {exporting
                  ? `Exporting ${Math.round(exportProgress * 100)}%`
                  : `Export ${segments.length} clip${segments.length === 1 ? "" : "s"}`}
              </button>
              {segments.length > 0 && (
                <button
                  type="button"
                  onClick={clearAll}
                  className="self-start font-mono text-[10px] uppercase tracking-[0.2em] text-ink-faint hover:text-far"
                >
                  Clear all
                </button>
              )}

              <div className="mt-2 border-t border-line pt-3 font-mono text-[9px] leading-relaxed tracking-[0.14em] text-ink-faint">
                Export emits ZIPs in batches of 10 to bound memory.{" "}
                <code className="rounded-sm bg-bg/60 px-1 text-ink-soft">
                  {cfg.syncCmd}
                </code>{" "}
                unzips every{" "}
                <code className="text-ink-soft">{cfg.zipPrefix}-*.zip</code>{" "}
                into{" "}
                <code className="text-ink-soft">public/{cfg.outputRoot}/</code>.
              </div>
            </aside>
          </div>
        )}
      </div>
    </main>
  );
}
