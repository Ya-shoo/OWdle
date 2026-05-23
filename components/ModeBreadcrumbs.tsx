import Link from "next/link";

// Visible breadcrumb that mirrors the BreadcrumbList JSON-LD emitted by
// modeJsonLd / the how-to-play page. Sits above the main content on
// secondary pages so Google's visible-HTML check matches the schema and
// users have a quick path back to /.
export function ModeBreadcrumbs({ label }: { label: string }) {
  return (
    <nav
      aria-label="Breadcrumb"
      className="mx-auto max-w-6xl px-4 pt-6 sm:px-6 lg:pt-8"
    >
      <ol className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.2em] text-ink-faint">
        <li>
          <Link
            href="/"
            className="transition-colors hover:text-accent"
          >
            Home
          </Link>
        </li>
        <li aria-hidden className="text-line">
          /
        </li>
        <li aria-current="page" className="text-info">
          {label}
        </li>
      </ol>
    </nav>
  );
}
