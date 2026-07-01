"use client";

// Dev-only dashboard for avatar-greeter mini-poll results. Aggregates every
// poll's vote counts from the shared owdle-votes D1 (via /api/poll-results),
// with a per-site (owdle / deadlockle) split. Toggle between local dev data
// (the wrangler functions helper on :8799) and the live site.

import { useCallback, useEffect, useState } from "react";

type Choice = { choice: string; count: number; owdle: number; deadlockle: number };
type Poll = { pollId: string; total: number; last: number; choices: Choice[] };

const LOCAL = "http://localhost:8799"; // OWdle og/functions helper
const LIVE = "https://playowdle.com";

export default function PollsDashboard() {
  const [source, setSource] = useState<"local" | "live">("local");
  const [polls, setPolls] = useState<Poll[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    setErr(null);
    const base = source === "local" ? LOCAL : LIVE;
    fetch(`${base}/api/poll-results`)
      .then((r) =>
        r.ok ? r.json() : Promise.reject(new Error(`status ${r.status}`)),
      )
      .then((d: { polls: Poll[] }) => setPolls(d.polls ?? []))
      .catch((e) => {
        setErr(String((e as Error).message || e));
        setPolls(null);
      })
      .finally(() => setLoading(false));
  }, [source]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <header className="mb-6">
        <p className="font-mono text-[10px] uppercase tracking-[0.24em] text-info">
          OWdle Dev · site chrome
        </p>
        <h1 className="mt-1 font-display text-3xl font-bold tracking-tight text-ink">
          Greeter poll results
        </h1>
        <p className="mt-2 font-mono text-[10px] uppercase tracking-[0.18em] text-ink-faint">
          vote counts for every greeter mini-poll · shared owdle-votes D1
        </p>
      </header>

      <div className="mb-6 flex flex-wrap items-center gap-3">
        <div className="flex overflow-hidden rounded-full border border-line">
          {(["local", "live"] as const).map((s) => (
            <button
              key={s}
              onClick={() => setSource(s)}
              className={`px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.16em] transition-colors ${
                source === s
                  ? "bg-ink text-canvas"
                  : "text-ink-soft hover:text-ink"
              }`}
            >
              {s === "local" ? "Local dev" : "Live"}
            </button>
          ))}
        </div>
        <button
          onClick={load}
          className="rounded-full border border-line px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.16em] text-ink-soft transition-colors hover:border-accent hover:text-accent"
        >
          ↻ Refresh
        </button>
        {loading && (
          <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-ink-faint">
            loading…
          </span>
        )}
      </div>

      {err && (
        <p className="rounded-(--radius-card) border border-line bg-inset/40 p-4 font-mono text-[11px] leading-relaxed text-ink-soft">
          Couldn&apos;t reach{" "}
          {source === "local" ? `the dev helper (${LOCAL})` : LIVE}/api/poll-results
          {" — "}
          {err}.{" "}
          {source === "local"
            ? "Is `npm run dev` running?"
            : "Deploy the poll endpoints first."}
        </p>
      )}

      {polls && polls.length === 0 && !err && (
        <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-ink-faint">
          No votes yet.
        </p>
      )}

      <div className="flex flex-col gap-5">
        {polls?.map((p) => (
          <section
            key={p.pollId}
            className="rounded-(--radius-card) border border-line bg-inset/40 p-5"
          >
            <div className="mb-3 flex items-baseline justify-between gap-3">
              <span className="font-display text-lg font-bold text-accent">
                {p.total} vote{p.total === 1 ? "" : "s"}
              </span>
              <span className="truncate font-mono text-[9px] uppercase tracking-[0.14em] text-ink-faint/70">
                {p.pollId}
              </span>
            </div>
            <div className="flex flex-col gap-2">
              {p.choices.map((c) => {
                const pct =
                  p.total > 0 ? Math.round((c.count / p.total) * 100) : 0;
                return (
                  <div
                    key={c.choice}
                    className="relative overflow-hidden rounded-lg border border-line px-3 py-2"
                  >
                    <div
                      aria-hidden
                      className="absolute inset-y-0 left-0 bg-accent/20"
                      style={{ width: `${pct}%` }}
                    />
                    <div className="relative flex items-center justify-between gap-3 text-sm">
                      <span className="truncate font-medium text-ink">
                        {c.choice.replace(/_/g, " ")}
                      </span>
                      <span className="flex shrink-0 items-center gap-3 font-mono text-[11px]">
                        <span className="text-ink-faint">
                          ow {c.owdle} · dl {c.deadlockle}
                        </span>
                        <span className="tabular-nums text-ink-soft">{c.count}</span>
                        <span className="w-9 text-right tabular-nums text-accent-soft">
                          {pct}%
                        </span>
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        ))}
      </div>
    </main>
  );
}
