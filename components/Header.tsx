import Link from "next/link";
import { Brand } from "./Brand";
import { HeaderProgress } from "./HeaderProgress";
import { NextResetCountdown } from "./NextResetCountdown";

export function Header() {
  return (
    <header className="border-b border-line bg-canvas/80 backdrop-blur-sm">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
        <Link href="/" className="group inline-flex items-baseline gap-2">
          <Brand />
        </Link>
        <div className="flex items-center gap-5 sm:gap-7">
          <NextResetCountdown
            label="next "
            className="font-mono text-[10px] uppercase tracking-[0.2em] text-info sm:text-xs"
          />
          <HeaderProgress />
        </div>
      </div>
    </header>
  );
}
