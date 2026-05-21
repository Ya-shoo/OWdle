"use client";

import { useEffect, useMemo, useState } from "react";
import { MAPS } from "@/lib/maps";
import {
  loadMapFeedback,
  type SpotDifficulty,
  type SpotFeedback,
} from "@/lib/storage";
import spotsData from "@/data/spots.json";
import { media } from "@/lib/media";

type Spot = {
  id: string;
  mapKey: string;
  worldX: number;
  worldY: number;
  worldZ: number;
  pixelX: number;
  pixelY: number;
  screenshot: string;
  capturedAt?: string;
  sourceFilename?: string;
};

const ALL_SPOTS: Spot[] = Object.values(
  spotsData as Record<string, Spot[]>,
).flat();

const DIFFICULTY_LABELS: Record<SpotDifficulty, string> = {
  "very-easy": "Very easy",
  easy: "Easy",
  normal: "Normal",
  hard: "Hard",
  "very-hard": "Very hard",
};

// Visual cues per difficulty bucket. text- / bg- pairs derived from
// the project's CSS-variable theme tokens.
const DIFFICULTY_TEXT: Record<SpotDifficulty, string> = {
  "very-easy": "text-correct",
  easy: "text-correct",
  normal: "text-info",
  hard: "text-accent-soft",
  "very-hard": "text-far",
};
const DIFFICULTY_BG: Record<SpotDifficulty, string> = {
  "very-easy": "bg-correct",
  easy: "bg-correct/70",
  normal: "bg-info",
  hard: "bg-accent-soft",
  "very-hard": "bg-far",
};
const DIFFICULTY_ORDER: ReadonlyArray<SpotDifficulty> = [
  "very-easy",
  "easy",
  "normal",
  "hard",
  "very-hard",
];

type ShowFilter = "all" | "rated" | "unrated" | "flagged-off" | "flagged-ok";
type SortMode = "updated" | "map" | "id";

export function MapAdmin() {
  // Snapshot of the localStorage feedback map. We re-read on a manual
  // refresh button only; the admin doesn't poll because storage events
  // would only fire from another tab anyway.
  const [feedback, setFeedback] = useState<Record<string, SpotFeedback>>({});
  const [mapFilter, setMapFilter] = useState<string>("__all__");
  const [showFilter, setShowFilter] = useState<ShowFilter>("all");
  const [sortMode, setSortMode] = useState<SortMode>("updated");

  useEffect(() => {
    setFeedback(loadMapFeedback());
  }, []);

  const refresh = () => setFeedback(loadMapFeedback());

  const mapsWithSpots = useMemo(() => {
    const keys = new Set(ALL_SPOTS.map((s) => s.mapKey));
    return MAPS.filter((m) => keys.has(m.key));
  }, []);

  const rows = useMemo(() => {
    let spots = ALL_SPOTS;
    if (mapFilter !== "__all__") {
      spots = spots.filter((s) => s.mapKey === mapFilter);
    }
    const joined = spots.map((spot) => ({ spot, fb: feedback[spot.id] }));
    const filtered = joined.filter(({ fb }) => {
      switch (showFilter) {
        case "all":
          return true;
        case "rated":
          return !!fb && (!!fb.difficulty || fb.pinAccurate !== undefined);
        case "unrated":
          return !fb || (!fb.difficulty && fb.pinAccurate === undefined);
        case "flagged-off":
          return fb?.pinAccurate === false;
        case "flagged-ok":
          return fb?.pinAccurate === true;
      }
    });
    filtered.sort((a, b) => {
      if (sortMode === "updated") {
        // Spots with feedback first, newest first; then unrated by id.
        const aTime = a.fb?.updatedAt ?? "";
        const bTime = b.fb?.updatedAt ?? "";
        if (aTime && !bTime) return -1;
        if (!aTime && bTime) return 1;
        return bTime.localeCompare(aTime);
      }
      if (sortMode === "map") {
        return (
          a.spot.mapKey.localeCompare(b.spot.mapKey) ||
          a.spot.id.localeCompare(b.spot.id)
        );
      }
      return a.spot.id.localeCompare(b.spot.id);
    });
    return filtered;
  }, [feedback, mapFilter, showFilter, sortMode]);

  const stats = useMemo(() => {
    const allFb = Object.values(feedback);
    const ratedCount = allFb.filter(
      (f) => !!f.difficulty || f.pinAccurate !== undefined,
    ).length;
    const flaggedOff = allFb.filter((f) => f.pinAccurate === false).length;
    const flaggedOk = allFb.filter((f) => f.pinAccurate === true).length;
    const buckets: Record<SpotDifficulty, number> = {
      "very-easy": 0,
      easy: 0,
      normal: 0,
      hard: 0,
      "very-hard": 0,
    };
    for (const f of allFb) {
      if (f.difficulty) buckets[f.difficulty]++;
    }
    return {
      totalSpots: ALL_SPOTS.length,
      ratedCount,
      flaggedOff,
      flaggedOk,
      buckets,
    };
  }, [feedback]);

  // Max bucket count so we can scale the difficulty-distribution bars.
  const bucketMax = Math.max(1, ...Object.values(stats.buckets));

  return (
    <main className="min-h-screen bg-bg text-ink">
      <div className="mx-auto max-w-[1400px] px-4 py-6 sm:px-6 sm:py-10 lg:px-8">
        <header className="mb-6 flex items-baseline justify-between gap-4">
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[0.24em] text-info">
              OWdle dev tool · map mode
            </p>
            <h1 className="mt-1 font-display text-3xl text-ink sm:text-4xl">
              Feedback admin
            </h1>
            <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.18em] text-ink-faint">
              local-only · backend pending · single-user view
            </p>
          </div>
          <button
            type="button"
            onClick={refresh}
            className="rounded-(--radius-card) border border-line px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.2em] text-ink-soft transition-colors hover:border-accent hover:text-accent"
          >
            Refresh
          </button>
        </header>

        {/* Stat cards */}
        <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard label="Total spots" value={stats.totalSpots} />
          <StatCard label="Rated" value={stats.ratedCount} />
          <StatCard
            label="Pin accurate (flagged)"
            value={stats.flaggedOk}
            color="text-correct"
          />
          <StatCard
            label="Pin off (flagged)"
            value={stats.flaggedOff}
            color="text-far"
          />
        </div>

        {/* Difficulty distribution */}
        <div className="mb-6 rounded-(--radius-card) border border-line bg-inset/40 p-4">
          <p className="mb-3 font-mono text-[10px] uppercase tracking-[0.2em] text-info">
            Difficulty distribution
          </p>
          <div className="flex items-end gap-2">
            {DIFFICULTY_ORDER.map((k) => {
              const count = stats.buckets[k];
              const heightPct = (count / bucketMax) * 100;
              return (
                <div key={k} className="flex flex-1 flex-col items-center gap-1">
                  <div className="flex h-24 w-full items-end">
                    <div
                      className={"w-full rounded-sm " + DIFFICULTY_BG[k]}
                      style={{ height: `${Math.max(4, heightPct)}%` }}
                    />
                  </div>
                  <p
                    className={
                      "text-center font-mono text-[10px] uppercase tracking-[0.16em] " +
                      DIFFICULTY_TEXT[k]
                    }
                  >
                    {DIFFICULTY_LABELS[k]}
                  </p>
                  <p className="font-mono text-[10px] tracking-[0.18em] text-ink">
                    {count}
                  </p>
                </div>
              );
            })}
          </div>
        </div>

        {/* Filters */}
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2">
            <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-faint">
              Map
            </span>
            <select
              value={mapFilter}
              onChange={(e) => setMapFilter(e.target.value)}
              className="rounded-(--radius-card) border border-line bg-inset/60 px-3 py-1.5 text-sm text-ink outline-none focus:border-accent"
            >
              <option value="__all__">All maps</option>
              {mapsWithSpots.map((m) => (
                <option key={m.key} value={m.key}>
                  {m.label}
                </option>
              ))}
            </select>
          </label>

          <label className="flex items-center gap-2">
            <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-faint">
              Show
            </span>
            <select
              value={showFilter}
              onChange={(e) => setShowFilter(e.target.value as ShowFilter)}
              className="rounded-(--radius-card) border border-line bg-inset/60 px-3 py-1.5 text-sm text-ink outline-none focus:border-accent"
            >
              <option value="all">All</option>
              <option value="rated">Rated only</option>
              <option value="unrated">Unrated only</option>
              <option value="flagged-off">Flagged pin off</option>
              <option value="flagged-ok">Flagged pin accurate</option>
            </select>
          </label>

          <label className="flex items-center gap-2">
            <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-faint">
              Sort
            </span>
            <select
              value={sortMode}
              onChange={(e) => setSortMode(e.target.value as SortMode)}
              className="rounded-(--radius-card) border border-line bg-inset/60 px-3 py-1.5 text-sm text-ink outline-none focus:border-accent"
            >
              <option value="updated">Recently updated</option>
              <option value="map">Map → spot id</option>
              <option value="id">Spot id</option>
            </select>
          </label>

          <span className="ml-auto font-mono text-[10px] tracking-[0.18em] text-ink-faint">
            showing {rows.length} of {ALL_SPOTS.length}
          </span>
        </div>

        {/* Row list */}
        <ul className="flex flex-col gap-2">
          {rows.map(({ spot, fb }) => (
            <SpotRow key={spot.id} spot={spot} fb={fb} />
          ))}
        </ul>

        {rows.length === 0 && (
          <p className="mt-16 text-center font-mono text-[10px] uppercase tracking-[0.2em] text-ink-faint">
            No spots match the current filters.
          </p>
        )}
      </div>
    </main>
  );
}

function StatCard(props: { label: string; value: number; color?: string }) {
  return (
    <div className="rounded-(--radius-card) border border-line bg-inset/40 p-4">
      <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-ink-faint">
        {props.label}
      </p>
      <p className={"mt-1 font-display text-3xl " + (props.color ?? "text-ink")}>
        {props.value}
      </p>
    </div>
  );
}

function SpotRow(props: { spot: Spot; fb: SpotFeedback | undefined }) {
  const { spot, fb } = props;
  const mapLabel =
    MAPS.find((m) => m.key === spot.mapKey)?.label ?? spot.mapKey;
  return (
    <li className="flex items-center gap-3 rounded-(--radius-card) border border-line bg-inset/30 p-3">
      <a
        href={media(spot.screenshot)}
        target="_blank"
        rel="noreferrer"
        className="block h-16 w-28 shrink-0 overflow-hidden rounded-sm bg-bg/60"
        title="Open masked screenshot in new tab"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={media(spot.screenshot)}
          alt=""
          className="h-full w-full object-cover"
          loading="lazy"
        />
      </a>
      <div className="min-w-0 flex-1">
        <p className="font-mono text-[11px] tracking-[0.14em] text-ink">
          <span className="text-accent">{mapLabel}</span>
          <span className="ml-2 text-ink-faint">{spot.id}</span>
        </p>
        <p className="mt-0.5 font-mono text-[10px] tracking-[0.14em] text-ink-faint">
          POS ({spot.worldX.toFixed(1)}, {spot.worldY.toFixed(1)},{" "}
          {spot.worldZ.toFixed(1)}) → ({Math.round(spot.pixelX)},{" "}
          {Math.round(spot.pixelY)})
        </p>
        {spot.sourceFilename && (
          <p className="mt-0.5 font-mono text-[9px] tracking-[0.14em] text-ink-faint/70">
            {spot.sourceFilename}
          </p>
        )}
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1 text-right">
        {fb?.difficulty ? (
          <span
            className={
              "font-mono text-[10px] uppercase tracking-[0.16em] " +
              DIFFICULTY_TEXT[fb.difficulty]
            }
          >
            {DIFFICULTY_LABELS[fb.difficulty]}
          </span>
        ) : (
          <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-ink-faint/50">
            no difficulty
          </span>
        )}
        {fb?.pinAccurate === true && (
          <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-correct">
            ✓ pin accurate
          </span>
        )}
        {fb?.pinAccurate === false && (
          <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-far">
            ✗ pin off
          </span>
        )}
        {fb && (
          <span className="font-mono text-[9px] tracking-[0.14em] text-ink-faint/70">
            {timeAgo(fb.updatedAt)}
          </span>
        )}
      </div>
    </li>
  );
}

function timeAgo(iso: string): string {
  const then = new Date(iso).getTime();
  if (!isFinite(then)) return "—";
  const now = Date.now();
  const sec = Math.max(0, Math.floor((now - then) / 1000));
  if (sec < 60) return `${sec}s ago`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  return `${day}d ago`;
}
