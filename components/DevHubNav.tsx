// Top nav for OWdle's local dev hub. Surfaces every internal tool so a
// developer can move between them without remembering URLs. New tools
// register here by adding a row to `TOOLS`.
//
// Dev-only: each /labeler/* page already gates on NODE_ENV (server-side
// notFound in prod), so this component only renders in dev environments.

"use client";

import { usePathname } from "next/navigation";
import Link from "next/link";
import clsx from "clsx";

type Tool = {
  href: string;
  label: string;
  description: string;
  // Optional external port that must be running for the tool to work.
  // Surfaces as a small footnote so you remember which helper server
  // backs each page.
  helper?: string;
};

const TOOLS: Tool[] = [
  {
    href: "/labeler/",
    label: "Audio labeler",
    description: "Carve ability clips out of capture footage.",
  },
  {
    href: "/labeler/votes/",
    label: "Votes admin",
    description: "Live tally of next-game votes across OWdle + Deadlockle.",
    helper: "localhost:8788",
  },
];

export function DevHubNav() {
  const pathname = usePathname();
  // Normalize so /labeler matches /labeler/ — Next's trailingSlash: true
  // can hand back either form depending on hydration timing.
  const here = pathname?.replace(/\/+$/, "/") ?? "/";

  return (
    <header className="border-b border-line bg-inset/60 px-4 py-3 sm:px-6">
      <div className="mx-auto flex max-w-6xl flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="font-mono text-[11px] uppercase tracking-[0.22em] text-info">
            OWdle dev hub
          </div>
          <div className="mt-0.5 text-xs text-ink-faint">
            Local-only tools · gated behind <code>NODE_ENV !== "production"</code>
          </div>
        </div>
        <nav className="flex flex-wrap gap-2">
          {TOOLS.map((t) => {
            const active = here === t.href.replace(/\/+$/, "/");
            return (
              <Link
                key={t.href}
                href={t.href}
                title={
                  t.description + (t.helper ? ` (helper: ${t.helper})` : "")
                }
                className={clsx(
                  "rounded-(--radius-card) border px-3 py-1.5 text-xs transition-colors",
                  active
                    ? "border-info bg-info/10 text-info"
                    : "border-line text-ink-soft hover:border-info hover:text-info",
                )}
              >
                {t.label}
              </Link>
            );
          })}
        </nav>
      </div>
    </header>
  );
}
