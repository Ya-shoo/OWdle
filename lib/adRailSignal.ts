"use client";

import { useSyncExternalStore } from "react";

// Cross-component signal: is a VISIBLE right side-rail ad currently on screen?
//
// AdRails (components/AdRails.tsx) is the single source of truth — it owns the
// tier geometry and the rail's fill state — and publishes here. Corner-floating
// UI that would otherwise sit under the right gutter reads it and shifts clear;
// today that's just the desktop greeter (components/SiteGreeter.tsx).
//
// A module store rather than React context because the publisher (body-level
// <AdRails/>) and the reader (<SiteGreeter/>, mounted deep inside the page)
// share no provider ancestor — both are position:fixed islands.
//
// "Visible" means an ad is actually painted in the right gutter, detected
// network-agnostically: AdRails watches the reserved right-rail slot for a real
// sized ad <iframe> (what Newor's header-bidding wrapper OR AdSense injects on a
// fill), or the dev ?adpreview mock — NOT an eligible-but-unfilled ghost slot.
// So through any low-fill ramp (the slot stays empty / collapses to nothing) the
// greeter keeps its normal corner instead of dodging an empty gutter.

let visible = false;
const listeners = new Set<() => void>();

export function setRightRailVisible(next: boolean): void {
  if (next === visible) return;
  visible = next;
  for (const notify of listeners) notify();
}

function subscribe(onChange: () => void): () => void {
  listeners.add(onChange);
  return () => {
    listeners.delete(onChange);
  };
}

// Server + first client paint report false — matching AdRails, which mounts
// nothing until its viewport effect runs — so the greeter hydrates in its
// default corner and only shifts once a real rail is confirmed. No mismatch.
export function useRightRailVisible(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => visible,
    () => false,
  );
}
