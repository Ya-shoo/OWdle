// Sister-site cross-promo. Lives on OWdle's home page (after the modes grid)
// and surfaces at the daily-complete state. UTM params let us track click
// traffic in analytics later.
//
// Two layouts:
//   - default (home page) — chunky padding, large headline, side-by-side
//     CTA on sm+ widths. Designed to anchor a full-width section.
//   - compact — slimmer padding, smaller headline, stacked button. Used
//     when nested inside the win-card's DailyCompletePanel where the
//     container is roughly max-w-md (448px) and the default sizing
//     would dwarf the rest of the card.
const DEADLOCKLE_URL =
  "https://deadlockle.com/?utm_source=owdle&utm_medium=sister-site";

export function TryDeadlockleCard({ compact = false }: { compact?: boolean }) {
  return (
    <a
      href={DEADLOCKLE_URL}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="Try Deadlockle, the daily Deadlock quiz (opens in a new tab)"
      className={
        "group relative block cursor-pointer overflow-hidden border border-line bg-surface transition-colors hover:bg-muted focus-visible:bg-muted active:bg-muted " +
        (compact ? "p-4" : "p-6 sm:p-7")
      }
      style={{ touchAction: "manipulation", WebkitTapHighlightColor: "rgba(214,160,92,0.18)" }}
    >
      {/* Deadlock teal/amber wash — hints at the destination palette */}
      <span
        aria-hidden
        className="pointer-events-none absolute inset-y-0 right-0 w-1/2"
        style={{
          background:
            "linear-gradient(110deg, transparent 0%, rgba(94,197,212,0.05) 50%, rgba(214,160,92,0.18) 100%)",
        }}
      />

      <div
        className={
          compact
            ? "relative flex flex-col gap-3"
            : "relative flex flex-col gap-5 sm:flex-row sm:items-center"
        }
      >
        <div className="flex-1">
          <p className="utility-label text-[10px] text-info">
            Sister site
          </p>
          <h3
            className={
              "mt-1 font-display text-ink " +
              (compact ? "text-xl" : "text-2xl sm:text-3xl")
            }
          >
            Play{" "}
            <span style={{ color: "#d6a05c" }}>
              Deadlock<span style={{ color: "#e9c694" }}>le</span>
            </span>
          </h3>
          {!compact && (
            <p className="utility-label mt-1 text-xs text-ink-soft">
              The daily Deadlock quiz
            </p>
          )}
          <p
            className={
              "text-ink-soft " +
              (compact
                ? "mt-1.5 text-xs"
                : "mt-3 max-w-lg text-sm")
            }
          >
            {compact
              ? "The daily Deadlock quiz. Same format, different game."
              : "Same daily puzzle format, different game. Heroes, abilities, splash, items. Resets at 2:15am Pacific."}
          </p>
        </div>

        <span
          className={
            "utility-label inline-flex items-center gap-2 self-start border border-line bg-canvas text-ink transition-colors group-hover:border-edge group-hover:text-accent-soft " +
            (compact
              ? "px-3 py-2 text-xs"
              : "px-4 py-2.5 text-sm sm:self-auto")
          }
        >
          Try Deadlockle
          <svg
            aria-hidden
            width="14"
            height="10"
            viewBox="0 0 14 10"
            className="transition-transform duration-200 group-hover:translate-x-0.5"
          >
            <path
              d="M0 5 L12 5 M8 1 L13 5 L8 9"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="square"
            />
          </svg>
        </span>
      </div>
    </a>
  );
}
