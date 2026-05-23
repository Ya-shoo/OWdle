"use client";

import { useMemo } from "react";
import { HEROES_BY_KEY } from "@/lib/heroes";
import type { Conversation } from "@/lib/conversations";
import { getAllConversations } from "@/lib/daily";

// Dev picker for Quote mode. Lists every conversation in the pool with
// both speakers' names + the first line's text so the dev can recognize
// which scene each entry is. Override = serve that conversation
// instead of the daily seed.

type Props = {
  currentSpeakers: [string, string];
  overrideActive: boolean;
  onApply: (conv: Conversation | null) => void;
};

function summarize(conv: Conversation): string {
  const a = HEROES_BY_KEY[conv.speakers[0]]?.name ?? conv.speakers[0];
  const b = HEROES_BY_KEY[conv.speakers[1]]?.name ?? conv.speakers[1];
  const firstLine = conv.lines[0]?.text ?? "";
  const snippet = firstLine.length > 60
    ? firstLine.slice(0, 57) + "…"
    : firstLine;
  return `${a} × ${b} · ${snippet}`;
}

export function DevQuotePicker({
  currentSpeakers,
  overrideActive,
  onApply,
}: Props) {
  const conversations = useMemo<ReadonlyArray<Conversation>>(
    () => getAllConversations(),
    [],
  );

  // Match the daily/override pair against the pool. Falls back to the
  // first entry when nothing matches (e.g. stale persisted state).
  const currentIdx = conversations.findIndex(
    (c) =>
      c.speakers[0] === currentSpeakers[0] &&
      c.speakers[1] === currentSpeakers[1],
  );
  const safeIdx = currentIdx >= 0 ? currentIdx : 0;
  const selectedKey = `${safeIdx}`;

  const handleChange = (key: string) => {
    const idx = parseInt(key, 10);
    if (!Number.isNaN(idx) && conversations[idx]) {
      onApply(conversations[idx]);
    }
  };

  const handleStep = (delta: 1 | -1) => {
    if (conversations.length === 0) return;
    const next =
      (safeIdx + delta + conversations.length) % conversations.length;
    onApply(conversations[next]);
  };

  const handleRandom = () => {
    if (conversations.length === 0) return;
    let next = Math.floor(Math.random() * conversations.length);
    if (conversations.length > 1 && next === safeIdx) {
      next = (next + 1) % conversations.length;
    }
    onApply(conversations[next]);
  };

  const handleReset = () => onApply(null);

  return (
    <div className="mb-6 rounded-(--radius-card) border border-dashed border-accent/50 bg-accent/5 p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-accent">
          Dev · Quote picker
        </div>
        <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-faint">
          {safeIdx + 1} / {conversations.length}
          {overrideActive ? (
            <span className="ml-2 text-accent">override</span>
          ) : (
            <span className="ml-2 text-ink-faint">daily</span>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <select
          value={selectedKey}
          onChange={(e) => handleChange(e.target.value)}
          className="min-w-0 flex-1 rounded-(--radius-card) border border-line bg-inset/60 px-2 py-1.5 font-mono text-xs text-ink"
        >
          {conversations.map((c, i) => (
            <option key={i} value={i}>
              {summarize(c)}
            </option>
          ))}
        </select>

        <div className="ml-1 flex items-center gap-1">
          <button
            type="button"
            onClick={() => handleStep(-1)}
            className="rounded-(--radius-card) border border-line px-2 py-1.5 font-mono text-[11px] uppercase tracking-[0.18em] text-ink-soft transition-colors hover:border-accent/50 hover:text-accent"
            aria-label="Previous conversation"
          >
            ◀
          </button>
          <button
            type="button"
            onClick={handleRandom}
            className="rounded-(--radius-card) border border-line px-3 py-1.5 font-mono text-[11px] uppercase tracking-[0.18em] text-ink-soft transition-colors hover:border-accent/50 hover:text-accent"
          >
            Random
          </button>
          <button
            type="button"
            onClick={() => handleStep(1)}
            className="rounded-(--radius-card) border border-line px-2 py-1.5 font-mono text-[11px] uppercase tracking-[0.18em] text-ink-soft transition-colors hover:border-accent/50 hover:text-accent"
            aria-label="Next conversation"
          >
            ▶
          </button>
        </div>

        <button
          type="button"
          onClick={handleReset}
          disabled={!overrideActive}
          className="rounded-(--radius-card) border border-line px-3 py-1.5 font-mono text-[11px] uppercase tracking-[0.18em] text-ink-soft transition-colors hover:border-accent/50 hover:text-accent disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-line disabled:hover:text-ink-soft"
        >
          Today
        </button>
      </div>
    </div>
  );
}
