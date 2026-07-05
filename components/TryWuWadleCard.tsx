// Sister-site cross-promo, WuWadle flavor (wuwadle.app — the daily
// Wuthering Waves quiz). Same shape and variants as TryDeadlockleCard —
// keep the two in lockstep when either changes. Per the network convention
// a destination is always its own accent-on-dark: "Play WuWadle" is misty
// blue-on-dark here and on every sibling site.
//
// Two variants:
//   - default — small, centered branded card: "Play WuWadle" + a one-line
//     descriptor. The whole card is the link. Sits side-by-side with the
//     Deadlockle card in the home sister row.
//   - compact — legacy slim layout, retained for sibling API parity.
const WUWADLE_URL =
  "https://wuwadle.app/?utm_source=owdle&utm_medium=sister-site";

export function TryWuWadleCard({ compact = false }: { compact?: boolean }) {
  if (compact) {
    return (
      <a
        href={WUWADLE_URL}
        target="_blank"
        rel="noopener noreferrer"
        aria-label="Try WuWadle, the daily Wuthering Waves quiz (opens in a new tab)"
        className="group relative block cursor-pointer overflow-hidden border border-line bg-canvas p-4 transition-colors hover:bg-muted focus-visible:bg-muted active:bg-muted"
        style={{ touchAction: "manipulation", WebkitTapHighlightColor: "rgba(95,159,214,0.18)" }}
      >
        <div className="relative flex flex-col gap-3">
          <div className="flex-1">
            <p className="utility-label text-[10px] text-info">Sister site</p>
            <h3 className="mt-1 font-display text-xl text-ink">
              Play <span style={{ color: "#78b4e6" }}>WuWadle</span>
            </h3>
            <p className="mt-1.5 text-xs text-ink-soft">
              The daily Wuthering Waves quiz. Same format, different game.
            </p>
          </div>
          <span className="utility-label inline-flex items-center gap-2 self-start border border-line bg-canvas px-3 py-2 text-xs text-ink transition-colors group-hover:border-edge group-hover:text-accent-soft">
            Try WuWadle
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

  return (
    <a
      href={WUWADLE_URL}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="Try WuWadle, the daily Wuthering Waves quiz (opens in a new tab)"
      className="group relative flex w-full max-w-xs flex-col items-center gap-1 rounded-(--radius-card) bg-white p-5 text-center transition-[background-color,box-shadow] hover:bg-[#f4f7fb] hover:shadow-[0_2px_12px_-4px_rgba(53,96,143,0.55)] focus-visible:bg-[#f4f7fb] active:bg-[#f4f7fb] sm:p-6"
      style={{ touchAction: "manipulation", WebkitTapHighlightColor: "rgba(53,96,143,0.14)" }}
    >
      <h3
        className="text-xl font-bold sm:text-2xl"
        style={{
          fontFamily: "var(--font-noto-sans), ui-sans-serif, system-ui, sans-serif",
          color: "#1e2c44",
        }}
      >
        Play WuWa<span style={{ color: "#a8843f" }}>dle</span>
      </h3>
      <p
        className="text-xs font-medium"
        style={{
          fontFamily: "var(--font-noto-sans), ui-sans-serif, system-ui, sans-serif",
          color: "#4a5b74",
        }}
      >
        The daily Wuthering Waves quiz
      </p>
    </a>
  );
}
