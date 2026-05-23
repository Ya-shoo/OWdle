"use client";

// "← Dev hub" pill rendered inline next to the OWdle Brand in the
// global header whenever we're in a dev build (or on localhost). The
// pill links back to /labeler/ so testers playing through the live
// game routes (/sound/, /map/, /quote/, …) can jump to the hub
// without retyping the URL. Hides itself on the hub-index itself
// (no point pointing home from home) and on prod builds.

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

export function DevHubHeader() {
  const pathname = usePathname();
  // Dev/localhost gate, mirroring useShowDevControls in MapGame so
  // the chip and the in-game dev affordances appear together. Render
  // null on SSR + first paint to avoid hydration mismatches between
  // a localhost-only flag and the server-rendered HTML.
  const [show, setShow] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const isDev = process.env.NODE_ENV === "development";
    const isLocal = ["localhost", "127.0.0.1"].includes(
      window.location.hostname,
    );
    setShow(isDev || isLocal);
  }, []);

  if (!show) return null;
  if (!pathname) return null;
  // Hide on the hub-index itself — that page IS the directory.
  if (pathname === "/labeler" || pathname === "/labeler/") return null;

  return (
    <Link
      href="/labeler/"
      className="inline-flex items-center gap-1.5 rounded-(--radius-card) border border-accent px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.2em] text-accent transition-opacity hover:opacity-80"
      style={{ backgroundColor: "var(--bg-surface)" }}
    >
      <span aria-hidden>←</span>
      Dev hub
    </Link>
  );
}
