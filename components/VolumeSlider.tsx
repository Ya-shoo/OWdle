"use client";

import { useId, useRef } from "react";
import type { CSSProperties } from "react";
import { DEFAULT_VOLUME } from "@/lib/audio";

type Props = {
  value: number; // 0..1
  onChange: (value: number) => void;
  label?: string;
};

export function VolumeSlider({ value, onChange, label = "Volume" }: Props) {
  const id = useId();
  // Remember the last non-zero level so the speaker button can restore
  // it on un-mute (mirrors how YouTube / native players behave).
  const restoreRef = useRef<number>(value > 0 ? value : DEFAULT_VOLUME);
  if (value > 0) restoreRef.current = value;

  const pct = Math.round(value * 100);
  const muted = value <= 0;
  const fillStyle = { "--vol-fill": `${pct}%` } as CSSProperties;

  const toggleMute = () => onChange(muted ? restoreRef.current : 0);

  return (
    <div className="flex items-center gap-3">
      <button
        type="button"
        onClick={toggleMute}
        aria-label={muted ? "Unmute" : "Mute"}
        aria-pressed={muted}
        className="grid h-7 w-7 shrink-0 place-items-center rounded-(--radius-card) border border-line bg-muted text-ink-soft transition-colors hover:border-edge hover:text-accent focus-visible:border-accent focus-visible:text-accent"
      >
        <SpeakerIcon muted={muted} level={value} />
      </button>

      <div className="flex w-full max-w-[180px] items-center">
        <input
          id={id}
          type="range"
          min={0}
          max={100}
          step={1}
          value={pct}
          onChange={(e) => onChange(Number(e.target.value) / 100)}
          aria-label={label}
          aria-valuetext={`${pct}%`}
          style={fillStyle}
          className="volume-slider w-full"
        />
      </div>

      <span className="w-10 shrink-0 text-right utility-label text-[10px] text-ink-soft tabular-nums">
        {pct}
        <span className="text-ink-faint">%</span>
      </span>
    </div>
  );
}

function SpeakerIcon({ muted, level }: { muted: boolean; level: number }) {
  const wave1 = !muted && level > 0.05;
  const wave2 = !muted && level > 0.5;
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path
        d="M3 6h2.2L8.2 3.4v9.2L5.2 10H3z"
        fill="currentColor"
        stroke="none"
      />
      {wave1 && <path d="M10 6.2c.7.7.7 2.9 0 3.6" />}
      {wave2 && <path d="M11.8 4.2c1.6 1.5 1.6 6.1 0 7.6" />}
      {muted && (
        <>
          <line x1="10" y1="5.5" x2="14" y2="9.5" />
          <line x1="14" y1="5.5" x2="10" y2="9.5" />
        </>
      )}
    </svg>
  );
}
