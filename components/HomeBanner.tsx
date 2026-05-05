"use client";

import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { dayString } from "@/lib/daily";
import {
  getDailyBanners,
  STATIC_BANNERS,
  type Banner,
} from "@/lib/banners";

const ROTATE_MS = 10000;
const FADE_MS = 1400;

// Full-bleed backdrop for the hero section. Crossfades through a
// date-seeded sequence of Overwatch key art + map screenshots, with a slow
// Ken Burns drift on each frame to add motion. Sits behind the headline; a
// strong gradient at the bottom keeps text legibility intact.
//
// SSR uses STATIC_BANNERS so the first paint already shows an image; once
// the client mounts and `day` is known, we swap to the day-seeded order.
export function HomeBanner() {
  const [day, setDay] = useState<string | null>(null);
  const [idx, setIdx] = useState(0);

  useEffect(() => {
    setDay(dayString());
  }, []);

  const sequence = useMemo<Banner[]>(
    () => (day ? getDailyBanners(day) : STATIC_BANNERS),
    [day],
  );

  useEffect(() => {
    if (sequence.length < 2) return;
    const t = setInterval(
      () => setIdx((i) => (i + 1) % sequence.length),
      ROTATE_MS,
    );
    return () => clearInterval(t);
  }, [sequence.length]);

  const current = sequence[idx % Math.max(1, sequence.length)];

  return (
    <div className="absolute inset-0 overflow-hidden bg-canvas">
      {current && (
        // initial={false} skips the entrance animation on the first banner
        // — important for SSR/first paint, since `initial={{ opacity: 0 }}`
        // would otherwise render the image invisible until JS hydrated.
        <AnimatePresence mode="sync" initial={false}>
          <motion.div
            key={current.file}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: FADE_MS / 1000, ease: "easeOut" }}
            className="absolute inset-0"
          >
            {/* Inner wrapper handles the Ken Burns drift independently from
                the crossfade, so the next image starts its own zoom from
                neutral instead of inheriting the previous frame's transform. */}
            <motion.div
              initial={{ scale: 1.04 }}
              animate={{ scale: 1.12 }}
              transition={{
                duration: (ROTATE_MS + FADE_MS) / 1000,
                ease: "linear",
              }}
              className="absolute inset-0"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={current.file}
                alt=""
                className="block h-full w-full object-cover"
                loading="eager"
                decoding="async"
              />
            </motion.div>
          </motion.div>
        </AnimatePresence>
      )}

      {/* Top hairline tint and bottom-to-top fade keep the headline legible
          and ground the banner against the page background. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "linear-gradient(to bottom, rgba(10,14,20,0.55) 0%, rgba(10,14,20,0.10) 28%, rgba(10,14,20,0.50) 70%, var(--bg-base) 100%)",
        }}
      />

      {/* Subtle accent vignette in OW orange — barely there, but adds warmth */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse 70% 60% at 90% 100%, rgba(242,101,34,0.10), transparent 65%)",
        }}
      />
    </div>
  );
}
