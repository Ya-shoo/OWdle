import Link from "next/link";
import { Brand } from "./Brand";
import { DevHubHeader } from "./DevHubHeader";
import { HeaderProgress } from "./HeaderProgress";
import { NextResetCountdown } from "./NextResetCountdown";

export function Header() {
  return (
    <header className="border-b border-line bg-canvas/80 backdrop-blur-sm">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
        {/* OWdle brand on the left; the dev-hub chip slots in beside
            it but only renders on /labeler/* sub-routes (decided in
            the chip client component via usePathname). On every
            other route it returns null and the header is unchanged. */}
        <div className="flex items-center gap-3">
          <Link href="/" className="group inline-flex items-baseline gap-2">
            <Brand />
          </Link>
          <DevHubHeader />
        </div>
        <div className="flex items-center gap-5 sm:gap-7">
          {/* Single-line at ≥380px (covers iPhone 14 / SE / Pixel and up,
              where the shorter OWdle wordmark leaves plenty of room).
              Stacks "next" above the timer as a flush-right column on
              the very narrowest screens (iPhone 12 mini and smaller),
              so the timer never smushes against the brand. */}
          <NextResetCountdown
            label="next"
            className="flex flex-col items-end leading-tight font-mono text-[10px] uppercase tracking-[0.2em] text-info min-[380px]:flex-row min-[380px]:items-baseline min-[380px]:gap-1 min-[380px]:leading-none sm:text-xs"
          />
          <HeaderProgress />
        </div>
      </div>
    </header>
  );
}
