"use client";

import { useEffect } from "react";

// Scrolls `targetRef` into view once, on mount, aligning it to the top of
// the viewport (block: "start" by default). Modes render this conditionally
// on their "ended" state so it fires exactly at the completion transition
// (and on reload of a finished puzzle): the key element — Quote's dialogue,
// Spotlight's splash art — stays framed with the result card directly below,
// instead of NextModeCTA's default center-on-CTA scroll which pushes it off
// the top. One RAF lets the result card's entrance lock in its layout before
// we measure; aligning to the target's top keeps it stable regardless of how
// tall that card animates to.
export function ScrollIntoViewOnMount({
  targetRef,
  block = "start",
}: {
  targetRef: { current: HTMLElement | null };
  block?: ScrollLogicalPosition;
}) {
  useEffect(() => {
    const id = window.requestAnimationFrame(() => {
      targetRef.current?.scrollIntoView({ behavior: "smooth", block });
    });
    return () => window.cancelAnimationFrame(id);
  }, [targetRef, block]);
  return null;
}
