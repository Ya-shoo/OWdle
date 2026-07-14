"use client";

// Mini-poll rendered inside the greeter bubble, below the announcement text.
// Options come from /slash-tokens in the pinned Discord message (parsed by
// functions/api/greeter.ts). Clicking one POSTs to /api/greeter-poll, which
// records the vote (one per person per poll, server-deduped) and returns the
// live tally — we then swap the buttons for result bars. The pick is also kept
// in localStorage so a returning visitor sees results without re-voting; the
// server stays the source of truth for dedup. Re-clicking changes the vote.
//
// The greeter bubble is pointer-events-none (informational), so this wrapper
// re-enables pointer events for its buttons.

import { useEffect, useState } from "react";

type Option = { value: string; label: string };
type Tally = { percentages: Record<string, number>; mine: string | null };

const POLL_PREFIX = "owdle:greeter-poll:"; // localStorage: this browser's pick

export function GreeterPoll({
  pollId,
  options,
  apiBase,
}: {
  pollId: string;
  options: Option[];
  apiBase: string;
}) {
  const [tally, setTally] = useState<Tally | null>(null);
  const [voted, setVoted] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const endpoint = `${apiBase}/api/greeter-poll`;

  // If this browser already voted, show results (fetch the latest tally).
  // Otherwise show buttons without a network round-trip.
  useEffect(() => {
    let prior: string | null = null;
    try {
      prior = localStorage.getItem(POLL_PREFIX + pollId);
    } catch {
      /* storage off */
    }
    if (!prior) return;
    setVoted(prior);
    fetch(`${endpoint}?pollId=${encodeURIComponent(pollId)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((t: Tally | null) => t && setTally(t))
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pollId]);

  const vote = (choice: string) => {
    if (busy || choice === voted) return;
    setBusy(true);
    setVoted(choice); // optimistic
    try {
      localStorage.setItem(POLL_PREFIX + pollId, choice);
    } catch {
      /* ignore */
    }
    // No content-type header → stays a "simple" cross-origin request in dev
    // (the function parses the body as JSON regardless).
    fetch(endpoint, { method: "POST", body: JSON.stringify({ pollId, choice }) })
      .then((r) => (r.ok ? r.json() : null))
      .then((t: Tally | null) => t && setTally(t))
      .catch(() => {})
      .finally(() => setBusy(false));
  };

  const showResults = voted != null;

  return (
    <div className="pointer-events-auto mt-3 border-t border-canvas/15 pt-2.5">
      <div className="flex flex-col gap-1.5">
        {options.map((o) => {
          const pct = tally?.percentages[o.value] ?? 0;
          const mine = voted === o.value;
          return (
            <button
              key={o.value}
              type="button"
              disabled={busy}
              onClick={() => vote(o.value)}
              className={`relative overflow-hidden rounded-lg border px-2.5 py-1.5 text-left text-[11px] outline-none transition-colors focus-visible:ring-1 focus-visible:ring-accent disabled:opacity-70 ${
                mine ? "border-accent" : "border-canvas hover:border-accent"
              }`}
            >
              {showResults && (
                <span
                  aria-hidden
                  className={`absolute bottom-0 left-0 h-1 ${mine ? "bg-accent" : "bg-canvas"}`}
                  style={{ width: `${pct}%` }}
                />
              )}
              <span className="relative flex items-center justify-between gap-2">
                <span
                  className={`truncate ${mine ? "font-bold text-canvas" : "text-canvas/85"}`}
                >
                  {o.label}
                  {mine ? " ✓" : ""}
                </span>
                {showResults && (
                  <span className="shrink-0 tabular-nums text-canvas/70">{pct}%</span>
                )}
              </span>
            </button>
          );
        })}
      </div>
      {showResults && (
        <p className="mt-1.5 text-[10px] text-canvas/50">
          tap another to change
        </p>
      )}
    </div>
  );
}
