"use client";

import { useState } from "react";
import type { Hero } from "@/lib/heroes";
import { buildShareText } from "@/lib/share";

export function ShareButton({
  modeLabel,
  day,
  guesses,
  answer,
  headline,
}: {
  modeLabel: string;
  day: string;
  guesses: string[];
  answer: Hero;
  headline?: string;
}) {
  const [copied, setCopied] = useState(false);

  const onClick = () => {
    const text = buildShareText({ modeLabel, day, guesses, answer, headline });
    if (navigator.clipboard) {
      navigator.clipboard
        .writeText(text)
        .then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 1800);
        })
        .catch(() => {});
    }
  };

  return (
    <button
      onClick={onClick}
      className="rounded-(--radius-pill) bg-accent px-5 py-2.5 font-mono text-xs uppercase tracking-[0.18em] text-on-accent transition-opacity hover:opacity-90"
    >
      {copied ? "Copied" : "Share"}
    </button>
  );
}
