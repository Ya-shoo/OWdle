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

  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reqIdRef = useRef(0);
  const wrapRef = useRef<HTMLDivElement>(null);

  // Cache-bust the leaderboard fetch so a successful submit always shows
  // the user's pick reflected immediately, bypassing the 30s edge cache.
  const loadLeaderboard = useCallback(async () => {
    try {
      const res = await fetch(`/api/leaderboard?t=${Date.now()}`);
      if (!res.ok) {
        setLeaderboard([]);
        return;
      }
      const data = (await res.json()) as { results?: LeaderEntry[] };
      setLeaderboard(data.results ?? []);
    } catch {
      setLeaderboard([]);
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
      loadLeaderboard();
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
              Vote for another, or come back next month.
            </p>
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
            <h3 className="mt-2 font-soft text-xl font-bold text-ink sm:text-2xl">
              Which game should I work on next?
            </h3>
            <p className="mt-2 text-sm text-ink-soft">
              Search any game and vote. The most-requested ones get built.
            </p>

            <div className="relative mt-5">
              <div
                className={clsx(
                  "flex items-stretch border transition-colors",
                  selected
                    ? "border-accent"
                    : open
                      ? "border-edge"
                      : "border-line focus-within:border-edge",
                )}
                style={{
                  background:
                    "linear-gradient(180deg, #1d1814 0%, #14110d 100%)",
                }}
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
                  className="flex-1 bg-transparent px-4 py-3 font-sans text-sm text-ink placeholder:text-ink-faint disabled:opacity-50"
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

            <div className="mt-5 flex items-center gap-3">
              <button
                type="button"
                onClick={submit}
                disabled={
                  !selected ||
                  status.tag === "submitting" ||
                  (selected && voted.includes(selected.id))
                }
                className={clsx(
                  "inline-flex items-center gap-2 rounded-full px-6 py-2.5 font-soft text-sm font-bold transition-all duration-150",
                  selected && !voted.includes(selected.id)
                    ? "bg-accent text-on-accent shadow-lg shadow-accent/25 hover:bg-accent-soft hover:-translate-y-0.5"
                    : "cursor-not-allowed border border-line bg-canvas text-ink-faint",
                )}
              >
                {status.tag === "submitting"
                  ? "Sending…"
                  : selected && voted.includes(selected.id)
                    ? "Already voted"
                    : "Submit vote →"}
              </button>
              {status.tag === "error" ? (
                <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-far">
                  {status.message}
                </span>
              ) : null}
            </div>
          </>
        )}

      <Leaderboard data={leaderboard} />
    </div>
  );
}

// Top voted games. The order IS the data — we don't show counts so the
// rank can't be reverse-engineered into "X has 1 vote", which would
// cheapen the signal early on. Vertical list keeps it legible inside a
// narrow column; rank-1 gets a tinted thumb, top-3 ranks tinted accent.
function Leaderboard({ data }: { data: LeaderEntry[] | null }) {
  return (
    <div className="mt-6 border-t border-line pt-5">
      <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-info">
        Current top picks
      </p>
      {data === null ? (
        <p className="mt-3 font-mono text-[11px] uppercase tracking-[0.18em] text-ink-faint">
          Loading…
        </p>
      ) : data.length === 0 ? (
        <p className="mt-3 text-sm text-ink-soft">
          No votes yet. Be the first to weigh in.
        </p>
      ) : (
        <ol className="mt-3 space-y-2">
          {data.map((g, i) => (
            <li key={g.game_id} className="flex items-center gap-3">
              <span
                className={clsx(
                  "w-6 shrink-0 font-mono text-[11px] tabular-nums",
                  i === 0
                    ? "text-accent"
                    : i < 3
                      ? "text-accent-soft"
                      : "text-ink-faint",
                )}
              >
                {String(i + 1).padStart(2, "0")}
              </span>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={g.game_image ?? PLACEHOLDER_IMG}
                alt=""
                className="h-8 w-12 shrink-0 border border-line bg-inset object-cover"
                loading="lazy"
              />
              <span className="min-w-0 flex-1 truncate text-sm text-ink">
                {g.game_name}
              </span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
