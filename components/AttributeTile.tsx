"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { motion } from "motion/react";
import clsx from "clsx";
import type { AttrResult } from "@/lib/compare";

const STATUS_BG: Record<AttrResult["status"], string> = {
  correct: "bg-correct text-on-correct",
  partial: "bg-partial text-on-partial",
  far: "bg-far text-on-far",
  wrong: "bg-wrong text-on-wrong",
};

export type TileTooltip = {
  text: string;
  linkUrl: string;
  linkText: string;
};

export function AttributeTile({
  result,
  index,
  animate = true,
  tooltip,
}: {
  result: AttrResult;
  index: number;
  animate?: boolean;
  tooltip?: TileTooltip | null;
}) {
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout>>(null);
  const lastPointerType = useRef("mouse");

  const cancelClose = useCallback(() => {
    if (closeTimer.current) {
      clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
  }, []);

  const scheduleClose = useCallback(() => {
    cancelClose();
    closeTimer.current = setTimeout(() => setOpen(false), 80);
  }, [cancelClose]);

  useEffect(() => {
    return () => cancelClose();
  }, [cancelClose]);

  useEffect(() => {
    if (!open) return;
    function onClickOutside(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [open]);

  const tile = (
    <motion.div
      initial={animate ? { rotateX: -90, opacity: 0 } : false}
      animate={{ rotateX: 0, opacity: 1 }}
      transition={
        animate
          ? {
              duration: 0.45,
              delay: index * 0.08,
              ease: [0.22, 1, 0.36, 1],
            }
          : { duration: 0 }
      }
      style={{ transformOrigin: "top center", transformStyle: "preserve-3d" }}
      className={clsx(
        "tile-shape relative flex min-h-[72px] flex-col items-center justify-center px-2 py-2 text-center sm:min-h-[80px]",
        STATUS_BG[result.status],
        tooltip && "cursor-pointer",
      )}
    >
      <div className="font-mono text-[9px] uppercase tracking-[0.18em] opacity-70">
        {result.label}
      </div>
      <div className="mt-1 flex items-center gap-1 font-display text-sm leading-tight sm:text-base">
        <span className="font-medium">{result.display}</span>
        {result.hint === "higher" && (
          <span aria-label="answer is higher" className="text-base">
            ↑
          </span>
        )}
        {result.hint === "lower" && (
          <span aria-label="answer is lower" className="text-base">
            ↓
          </span>
        )}
      </div>
    </motion.div>
  );

  if (!tooltip) return tile;

  return (
    <div
      ref={wrapperRef}
      className="relative"
      onPointerDown={(e) => {
        lastPointerType.current = e.pointerType;
      }}
      onPointerEnter={(e) => {
        if (e.pointerType !== "mouse") return;
        cancelClose();
        setOpen(true);
      }}
      onPointerLeave={(e) => {
        if (e.pointerType !== "mouse") return;
        scheduleClose();
      }}
      onClick={() => {
        if (lastPointerType.current === "touch") {
          setOpen((v) => !v);
        }
      }}
    >
      {tile}
      {open && (
        <div
          className="absolute left-full top-1/2 z-50 ml-2 w-64 -translate-y-1/2 rounded-lg bg-canvas/95 p-3 text-left shadow-xl ring-1 ring-line backdrop-blur-sm"
          onClick={(e) => e.stopPropagation()}
          onPointerEnter={(e) => {
            if (e.pointerType === "mouse") cancelClose();
          }}
          onPointerLeave={(e) => {
            if (e.pointerType === "mouse") scheduleClose();
          }}
        >
          <p className="text-xs leading-relaxed text-ink-soft">
            {tooltip.text}
          </p>
          <a
            href={tooltip.linkUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-2 inline-block text-[10px] font-medium text-info hover:underline"
          >
            {tooltip.linkText} ↗
          </a>
          <div className="absolute right-full top-1/2 -translate-y-1/2 border-4 border-transparent border-r-line" />
        </div>
      )}
    </div>
  );
}
