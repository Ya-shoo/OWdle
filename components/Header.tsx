import Link from "next/link";
import { Brand } from "./Brand";
import { HeaderProgress } from "./HeaderProgress";

export function Header() {
  return (
    <header className="border-b border-line bg-canvas/80 backdrop-blur-sm">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
        <Link href="/" className="group inline-flex items-baseline gap-2">
          <Brand />
        </Link>
        <HeaderProgress />
      </div>
    </header>
  );
}
