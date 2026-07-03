"use client";

// Lets visitors search the RAWG games database and vote for which game
// should get the OWdle treatment next. Search is proxied through
// /api/search; the vote is recorded by /api/vote and de-duped server-side
// per (game, voter). We mirror voted IDs in localStorage so the UI can
// dim previously-voted entries and show a thank-you state on return.

import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";
import clsx from "clsx";

type Result = {
  id: string;
  name: string;
  released: string | null;
  image: string | null;
};

type Status =
  | { tag: "idle" }
  | { tag: "submitting" }
  | { tag: "submitted"; game: Result }
  | { tag: "error"; message: string };

type LeaderEntry = {
  game_id: string;
  game_name: string;
  game_image: string | null;
  game_released: string | null;
};

const STORAGE_KEY = "owdle:requested-games";
const SEARCH_DEBOUNCE_MS = 250;
const PLACEHOLDER_IMG =
  "data:image/svg+xml;utf8,%3Csvg xmlns='http://www.w3.org/2000/svg'/%3E";

// Dev-only stub for the leaderboard. /api/leaderboard is served by a
// Cloudflare Pages Function that doesn't run under `next dev`, so locally
// the panel sits in the empty state. The NODE_ENV check is replaced at
// build time and this constant is tree-shaken from the prod bundle.
const DEV_STUB_LEADERBOARD: LeaderEntry[] = [
  {
    game_id: "dev-stub-1",
    game_name: "Minecraft",
    game_image: "https://picsum.photos/seed/owdle-stub-mc/640/280",
    game_released: "2011-11-18",
  },
  {
    game_id: "dev-stub-2",
    game_name: "Baldur's Gate III",
    game_image: "https://picsum.photos/seed/owdle-stub-bg3/520/220",
    game_released: "2023-08-03",
  },
  {
    game_id: "dev-stub-3",
    game_name: "Honkai: Star Rail",
    game_image: "https://picsum.photos/seed/owdle-stub-hsr/520/220",
    game_released: "2023-04-26",
  },
  {
    game_id: "dev-stub-4",
    game_name: "Cookie Clicker",
    game_image: "https://picsum.photos/seed/owdle-stub-cc/520/220",
    game_released: "2013-08-08",
  },
  {
    game_id: "dev-stub-5",
    game_name: "Genshin Impact",
    game_image: "https://picsum.photos/seed/owdle-stub-gi/520/220",
    game_released: "2020-09-28",
  },
];

function loadVoted(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((x) => typeof x === "string") : [];
  } catch {
    return [];
  }
}

function saveVoted(ids: string[]) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(ids));
  } catch {
    /* quota / private mode — ignore */
  }
}

function year(released: string | null): string | null {
  if (!released) return null;
  const m = released.match(/^(\d{4})/);
  return m ? m[1] : null;
}

// Voter dedup uses a 2-day bucket aligned to the Unix epoch (see
// functions/_lib/types.ts:voterHash). This countdown tells the user how
// long until the bucket flips and a fresh round of votes opens up.
const TWO_DAYS_MS = 2 * 86400 * 1000;

function formatCountdown(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const days = Math.floor(total / 86400);
  const hours = Math.floor((total % 86400) / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  if (days > 0) return `${days}d ${hours}h ${minutes}m`;
  if (hours > 0) return `${hours}h ${minutes}m ${seconds}s`;
  if (minutes > 0) return `${minutes}m ${seconds}s`;
  return `${seconds}s`;
}

function useVoteRefreshCountdown(): string | null {
  const [text, setText] = useState<string | null>(null);
  useEffect(() => {
    const tick = () => {
      const now = Date.now();
      const next = (Math.floor(now / TWO_DAYS_MS) + 1) * TWO_DAYS_MS;
      setText(formatCountdown(next - now));
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);
  return text;
}

export function RequestNextGame() {
  const inputId = useId();
  const listboxId = `${inputId}-listbox`;
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Result[]>([]);
  const [searching, setSearching] = useState(false);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [selected, setSelected] = useState<Result | null>(null);
  const [status, setStatus] = useState<Status>({ tag: "idle" });
  const [voted, setVoted] = useState<string[]>([]);
  const [leaderboard, setLeaderboard] = useState<LeaderEntry[] | null>(null);
  const refreshIn = useVoteRefreshCountdown();

  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reqIdRef = useRef(0);
  const wrapRef = useRef<HTMLDivElement>(null);

  // The mount load hits the shared 30s edge cache (so most homepage views
  // are free CDN hits). Only the post-submit refetch cache-busts, so the
  // voter still sees their own pick reflected immediately.
  const loadLeaderboard = useCallback(async (fresh = false) => {
    const devFallback =
      process.env.NODE_ENV === "development" ? DEV_STUB_LEADERBOARD : [];
    try {
      const res = await fetch(
        fresh ? `/api/leaderboard?t=${Date.now()}` : "/api/leaderboard",
      );
      if (!res.ok) {
        setLeaderboard(devFallback);
        return;
      }
      const data = (await res.json()) as { results?: LeaderEntry[] };
      const results = data.results ?? [];
      setLeaderboard(results.length === 0 ? devFallback : results);
    } catch {
      setLeaderboard(devFallback);
    }
  }, []);

  useEffect(() => {
    setVoted(loadVoted());
    loadLeaderboard();
  }, [loadLeaderboard]);

  // Debounced search against /api/search.
  const runSearch = useCallback(async (q: string) => {
    const myReq = ++reqIdRef.current;
    if (q.trim().length < 2) {
      setResults([]);
      setSearching(false);
      return;
    }
    setSearching(true);
    try {
      const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`);
      if (myReq !== reqIdRef.current) return; // a newer query already fired
      if (!res.ok) {
        setResults([]);
        return;
      }
      const data = (await res.json()) as { results?: Result[] };
      setResults(data.results ?? []);
      setActiveIndex(0);
    } catch {
      if (myReq === reqIdRef.current) setResults([]);
    } finally {
      if (myReq === reqIdRef.current) setSearching(false);
    }
  }, []);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (selected) return; // not searching when a pick is staged
    debounceRef.current = setTimeout(() => runSearch(query), SEARCH_DEBOUNCE_MS);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, runSearch, selected]);

  // Click-outside closes the dropdown.
  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [open]);

  const choose = (r: Result) => {
    setSelected(r);
    setOpen(false);
    setQuery(r.name);
    setResults([]);
  };

  const reset = () => {
    setSelected(null);
    setQuery("");
    setResults([]);
    setStatus({ tag: "idle" });
    setOpen(false);
    requestAnimationFrame(() => inputRef.current?.focus());
  };

  const submit = async () => {
    if (!selected) return;
    setStatus({ tag: "submitting" });
    try {
      const res = await fetch("/api/vote", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          id: selected.id,
          name: selected.name,
          image: selected.image,
          released: selected.released,
        }),
      });
      if (!res.ok) {
        if (res.status === 429) {
          setStatus({
            tag: "error",
            message: "Too many votes from this network. Try again tomorrow.",
          });
        } else {
          setStatus({
            tag: "error",
            message: "Couldn't submit. Please try again in a moment.",
          });
        }
        return;
      }
      const next = Array.from(new Set([...voted, selected.id]));
      setVoted(next);
      saveVoted(next);
      setStatus({ tag: "submitted", game: selected });
      loadLeaderboard(true);
    } catch {
      setStatus({
        tag: "error",
        message: "Network error. Please try again.",
      });
    }
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (selected) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setOpen(true);
      setActiveIndex((i) => Math.min(i + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const target = results[activeIndex];
      if (target) choose(target);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  };

  const submitted = status.tag === "submitted";

  return (
    <div ref={wrapRef} className="flex h-full flex-col">
      {submitted ? (
          <>
            <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-correct">
              ✓ Vote recorded
            </p>
            <h3 className="mt-2 font-soft text-xl font-bold text-ink sm:text-2xl">
              Thanks, your pick is in.
            </h3>
            <p className="mt-2 text-sm text-ink-soft">
              You voted for{" "}
              <span className="text-ink">{status.game.name}</span>
              {year(status.game.released) ? ` (${year(status.game.released)})` : ""}.
              Vote for another below.
            </p>
            {refreshIn ? (
              <p className="mt-3 font-mono text-[10px] uppercase tracking-[0.22em] text-ink-faint">
                Vote again in{" "}
                <span className="tabular-nums text-info">{refreshIn}</span>
              </p>
            ) : null}
            <div className="mt-5">
              <button
                type="button"
                onClick={reset}
                className="inline-flex items-center gap-2 border border-line bg-canvas px-4 py-2 font-mono text-[11px] uppercase tracking-[0.2em] text-ink transition-colors hover:border-edge hover:text-accent-soft"
              >
                Vote again →
              </button>
            </div>
          </>
        ) : (
          <>
            <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-info">
              Request the next game
            </p>
            <h3 className="mt-1.5 font-soft text-lg font-bold text-ink sm:text-xl">
              Which game should I work on next?
            </h3>
            {refreshIn ? (
              <p className="mt-1.5 font-mono text-[10px] uppercase tracking-[0.22em] text-ink-faint">
                Vote again in{" "}
                <span className="tabular-nums text-info">{refreshIn}</span>
              </p>
            ) : null}

            <div className="relative mt-3">
              <div
                className={clsx(
                  "flex items-stretch border transition-colors",
                  selected
                    ? "border-accent"
                    : open
                      ? "border-edge"
                      : "border-line focus-within:border-edge",
                )}
                style={{ background: "var(--bg-inset)" }}
              >
                <input
                  ref={inputRef}
                  id={inputId}
                  type="text"
                  autoComplete="off"
                  spellCheck={false}
                  value={query}
                  disabled={status.tag === "submitting"}
                  onChange={(e) => {
                    setQuery(e.target.value);
                    setSelected(null);
                    setStatus({ tag: "idle" });
                    setOpen(true);
                  }}
                  onFocus={() => {
                    if (!selected && results.length > 0) setOpen(true);
                  }}
                  onKeyDown={onKeyDown}
                  placeholder="Search games…"
                  role="combobox"
                  aria-expanded={open}
                  aria-autocomplete="list"
                  aria-controls={listboxId}
                  aria-activedescendant={
                    open && results[activeIndex]
                      ? `${listboxId}-${results[activeIndex].id}`
                      : undefined
                  }
                  className="flex-1 bg-transparent px-3.5 py-1.5 font-sans text-sm text-ink placeholder:text-ink-faint disabled:opacity-50"
                />
                {selected ? (
                  <button
                    type="button"
                    onClick={reset}
                    className="border-l border-line px-3 font-mono text-[10px] uppercase tracking-[0.2em] text-ink-soft transition-colors hover:text-ink"
                    aria-label="Clear selection"
                  >
                    ×
                  </button>
                ) : searching ? (
                  <span className="flex items-center px-3 font-mono text-[10px] uppercase tracking-[0.2em] text-ink-faint">
                    …
                  </span>
                ) : null}
                <button
                  type="button"
                  onClick={submit}
                  disabled={
                    !selected ||
                    status.tag === "submitting" ||
                    (selected && voted.includes(selected.id))
                  }
                  className={clsx(
                    "my-1 mr-1 inline-flex shrink-0 self-center items-center rounded-full px-3 py-1 font-soft text-xs font-bold transition-colors duration-150",
                    selected && !voted.includes(selected.id)
                      ? "bg-accent text-on-accent shadow-md shadow-accent/25 hover:bg-accent-soft"
                      : "cursor-not-allowed border border-line bg-canvas/60 text-ink-faint",
                  )}
                >
                  {status.tag === "submitting"
                    ? "Sending…"
                    : selected && voted.includes(selected.id)
                      ? "Already voted"
                      : "Submit vote"}
                </button>
              </div>

              {open && !selected && results.length > 0 ? (
                <ul
                  id={listboxId}
                  role="listbox"
                  className="absolute z-30 mt-px max-h-72 w-full overflow-auto border border-edge bg-surface shadow-2xl shadow-black/60"
                >
                  {results.map((r, i) => {
                    const already = voted.includes(r.id);
                    const active = i === activeIndex;
                    return (
                      <li
                        key={r.id}
                        id={`${listboxId}-${r.id}`}
                        role="option"
                        aria-selected={active}
                        ref={(el) => {
                          if (active && el) el.scrollIntoView({ block: "nearest" });
                        }}
                        onMouseEnter={() => setActiveIndex(i)}
                        onMouseDown={(e) => {
                          e.preventDefault();
                          if (!already) choose(r);
                        }}
                        className={clsx(
                          "flex cursor-pointer items-center gap-3 px-3 py-2 transition-colors",
                          active && !already && "bg-muted",
                          already && "cursor-not-allowed opacity-50",
                        )}
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={r.image ?? PLACEHOLDER_IMG}
                          alt=""
                          className="h-8 w-12 shrink-0 border border-line bg-inset object-cover"
                          loading="lazy"
                        />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm text-ink">
                            {r.name}
                          </span>
                          <span className="block font-mono text-[10px] uppercase tracking-[0.18em] text-ink-faint">
                            {year(r.released) ?? "—"}
                            {already ? " · already voted" : ""}
                          </span>
                        </span>
                      </li>
                    );
                  })}
                </ul>
              ) : null}

              {open && !selected && !searching && query.trim().length >= 2 && results.length === 0 ? (
                <div className="absolute z-30 mt-px w-full border border-line bg-surface px-3 py-3 font-mono text-[11px] uppercase tracking-[0.18em] text-ink-faint">
                  No matches.
                </div>
              ) : null}
            </div>

            {status.tag === "error" ? (
              <p className="mt-2 text-right font-mono text-[10px] uppercase tracking-[0.2em] text-far">
                {status.message}
              </p>
            ) : null}
          </>
        )}

      <Leaderboard data={leaderboard} />
    </div>
  );
}

// Top voted games. The order IS the data: we don't show counts so the
// rank can't be reverse-engineered into "X has 1 vote", which would
// cheapen the signal early on. Card grid where the leader gets a hero
// tile and ranks 2-5 sit in a 2-col grid below. Each tile is large
// enough to read the game's cover art at a glance.
function Leaderboard({ data }: { data: LeaderEntry[] | null }) {
  return (
    <div className="mt-4 border-t border-line pt-3">
      <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-info">
        Current top picks
      </p>
      {data === null ? (
        <p className="mt-2 font-mono text-[11px] uppercase tracking-[0.18em] text-ink-faint">
          Loading…
        </p>
      ) : data.length === 0 ? (
        <p className="mt-2 text-sm text-ink-soft">
          No votes yet. Be the first to weigh in.
        </p>
      ) : (
        <div className="mt-2 grid grid-cols-2 gap-1.5">
          {data.map((g, i) => (
            <PickCard
              key={g.game_id}
              rank={i + 1}
              entry={g}
              hero={i === 0}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// Single tile inside the Leaderboard grid. The hero variant spans both
// columns and uses a taller crop so the leader reads as the headline pick.
// All variants share the same overlay scheme: rank chip top-left, name
// band on a dark gradient at the bottom, image filling the rest.
function PickCard({
  rank,
  entry,
  hero,
}: {
  rank: number;
  entry: LeaderEntry;
  hero: boolean;
}) {
  return (
    <div
      className={clsx(
        "relative overflow-hidden border border-line bg-inset",
        hero && "col-span-2",
      )}
    >
      <div className={clsx("relative", hero ? "aspect-[3.3/1]" : "aspect-[2.5/1]")}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={entry.game_image ?? PLACEHOLDER_IMG}
          alt=""
          className="absolute inset-0 h-full w-full object-cover"
          loading="lazy"
        />

        {/* Bottom gradient gives the name band legibility regardless of
            how light or busy the underlying cover art happens to be. */}
        <span
          aria-hidden
          className="pointer-events-none absolute inset-x-0 bottom-0 h-2/3 bg-gradient-to-t from-black/85 via-black/40 to-transparent"
        />

        <span
          className={clsx(
            // Rank chip sits over the cover art, so it keeps a dark scrim +
            // light/accent glyphs regardless of how light or busy the
            // underlying cover art is (independent of the card's surface).
            "absolute left-2 top-2 inline-flex items-center border bg-black/70 px-1.5 py-0.5 font-mono text-[10px] tabular-nums backdrop-blur-sm",
            rank === 1
              ? "border-accent text-accent"
              : rank <= 3
                ? "border-accent-soft text-accent-soft"
                : "border-white/25 text-white/70",
          )}
        >
          {String(rank).padStart(2, "0")}
        </span>

        <p
          className={clsx(
            // Name band rides the dark bottom gradient, so it stays light and
            // legible over any cover art regardless of the card's surface.
            "absolute inset-x-0 bottom-0 truncate px-3 py-1.5 font-display text-white",
            hero ? "text-base sm:text-lg" : "text-xs sm:text-sm",
          )}
        >
          {entry.game_name}
        </p>
      </div>
    </div>
  );
}
