"use client";

import { ReactNode, useState } from "react";
import { trackShareClicked } from "@/lib/tracking";

// LoLdle-style copyable share block: the text itself, visible and
// selectable, with explicit Copy / Share actions. Plain strings travel
// friction-free into Discord / iMessage / group chats. Callers build
// the text (daily summary, classic emoji grid, …) and this owns the
// clipboard / native-share / X-intent plumbing + tracking.
//
// When a `share` node is passed, it renders IN PLACE of the block's
// own native-share/X button — one share affordance per surface, and
// it's the link-first ShareButton (carries the /r/[code] unfurl card).
// Mirrors Deadlockle's one-button layout; surfaces not yet migrated
// keep the built-in button by omitting the prop.
type Props = {
  text: string;
  surface: "round_result" | "daily_complete";
  dailyId: string;
  mode?: Parameters<typeof trackShareClicked>[0]["mode"];
  share?: ReactNode;
};

export function TextShareBlock({ text, surface, dailyId, mode, share }: Props) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
      trackShareClicked({ surface, method: "clipboard-text", dailyId, mode });
    } catch {
      // Clipboard denied — the block is select-all, so manual copy
      // still works; no error worth surfacing.
    }
  };

  const shareText = async () => {
    if (typeof navigator.share === "function") {
      try {
        await navigator.share({ text });
        trackShareClicked({ surface, method: "native", dailyId, mode });
        return;
      } catch (err) {
        // Dismissing the sheet isn't a failure; anything else falls
        // through to the X intent below.
        if (err instanceof DOMException && err.name === "AbortError") {
          return;
        }
      }
    }
    window.open(
      `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}`,
      "_blank",
      "noopener",
    );
    trackShareClicked({ surface, method: "twitter_intent", dailyId, mode });
  };

  return (
    <div className="w-full">
      {/* select-all so a tap/click selects the whole block for manual
          copying even if the clipboard API is unavailable. */}
      <div className="select-all whitespace-pre-line rounded-(--radius-card) border border-line bg-inset/40 px-4 py-4 text-center font-mono text-[13px] leading-relaxed text-ink">
        {text}
      </div>
      <div className="mt-3 flex flex-wrap items-center justify-center gap-3">
        <button
          type="button"
          onClick={copy}
          className="inline-flex items-center gap-2 rounded-full bg-info/15 px-5 py-3 text-info ring-1 ring-info/40 transition-all hover:bg-info/25 hover:ring-info active:scale-[0.98]"
        >
          <span className="font-mono text-[11px] uppercase tracking-[0.22em]">
            {copied ? "Copied ✓" : share ? "Copy text" : "Copy"}
          </span>
        </button>
        {share ?? (
          <button
            type="button"
            onClick={shareText}
            className="inline-flex items-center gap-2 rounded-full border border-line bg-inset/40 px-4 py-3 text-ink-soft transition-colors hover:border-info/60 hover:text-info active:scale-[0.98]"
          >
            <span className="font-mono text-[11px] uppercase tracking-[0.22em]">
              Share
            </span>
          </button>
        )}
      </div>
    </div>
  );
}
