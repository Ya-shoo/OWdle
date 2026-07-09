"use client";

import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { dayString } from "@/lib/daily";
import {
  bannerVariants,
  getDailyBanners,
  STATIC_BANNERS,
  type Banner,
} from "@/lib/banners";
import { media } from "@/lib/media";

const MOBILE_BREAKPOINT = "(max-width: 767px)";

const ROTATE_MS = 10000;
const FADE_MS = 1400;

// Full-bleed backdrop for the hero section. Crossfades through a
// date-seeded sequence of Overwatch key art + map screenshots, with a slow
// Ken Burns drift on each frame to add motion. Sits behind the headline; a
// strong gradient at the bottom keeps text legibility intact.
//
// `dim` drops the whole banner to backdrop luminance for content-dense
// hero states (the daily-complete summary spans the section's full height,
// so the default reading-band scrim isn't enough on bright frames).
//
// SSR uses STATIC_BANNERS so the first paint already shows an image; once
// the client mounts and `day` is known, we swap to the day-seeded order.
export function HomeBanner({ dim = false }: { dim?: boolean }) {
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
              <BannerPicture banner={current} />
            </motion.div>
          </motion.div>
        </AnimatePresence>
      )}

      {/* Top hairline tint keeps the headline legible; the bottom half is a
          long, feathered fade that eases the banner into the flat page
          background so there's no hard seam where the art meets the cards.
          Extra stops in the 55–100% band spread the darkening gradually
          rather than ramping up over a short distance. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "linear-gradient(to bottom, rgba(10,14,20,0.55) 0%, rgba(10,14,20,0.04) 32%, rgba(10,14,20,0.10) 58%, rgba(10,14,20,0.24) 76%, rgba(10,14,20,0.48) 89%, rgba(10,14,20,0.80) 96%, var(--bg-base) 100%)",
        }}
      />

      {/* Dim veil — near-uniform second layer stacked over the reading-band
          scrim above. The daily-complete hero fills the section top to
          bottom with stats, streak chrome, and the share block, all styled
          for the flat dark canvas; this veil pulls even the brightest
          frames down to roughly canvas luminance so those pieces stay
          legible while the art keeps drifting behind as a mood layer.
          Opacity-transitions (gradients can't crossfade) because `dim`
          flips true only after the client reads localStorage. */}
      <div
        aria-hidden
        className={`pointer-events-none absolute inset-0 transition-opacity duration-700 ${
          dim ? "opacity-100" : "opacity-0"
        }`}
        style={{
          background:
            "linear-gradient(to bottom, rgba(10,14,20,0.80) 0%, rgba(10,14,20,0.70) 40%, rgba(10,14,20,0.70) 68%, rgba(10,14,20,0.80) 90%, rgba(10,14,20,0.88) 100%)",
        }}
      />
    </div>
  );
}

// Renders the banner via <picture> so phones get a 768w AVIF/WebP variant
// (~15-30 KB) instead of the full 1920w original (~400 KB). The fallback
// <img src> still points at the manifest file, which keeps the SSR HTML byte
// stream pointing at a real asset for crawlers and ancient browsers.
function BannerPicture({ banner }: { banner: Banner }) {
  const v = bannerVariants(banner.file);
  return (
    <picture>
      <source
        type="image/avif"
        media={MOBILE_BREAKPOINT}
        srcSet={media(v.mobileAvif)}
      />
      <source
        type="image/webp"
        media={MOBILE_BREAKPOINT}
        srcSet={media(v.mobileWebp)}
      />
      <source type="image/avif" srcSet={media(v.desktopAvif)} />
      <source type="image/webp" srcSet={media(v.desktopWebp)} />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={media(banner.file)}
        alt=""
        className="block h-full w-full object-cover"
        loading="eager"
        decoding="async"
        fetchPriority="high"
      />
    </picture>
  );
}
