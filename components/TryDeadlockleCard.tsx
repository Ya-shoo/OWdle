// Sister-site cross-promo. Lives on OWdle's home page (in the two-card
// sister row) and on each mode's finish screen. UTM params let us track the
// click traffic in analytics later.
//
// Keep in lockstep with TryWuWadleCard (identical shape, different
// destination accent) and with the sibling sites' cards: a given destination
// is always its own accent-on-dark, on every site — "Play Deadlockle" is
// always gold-on-dark here and on wuwadle.app.
//
// Two variants:
//   - default — small, centered branded card: "Play Deadlockle" + a one-line
//     descriptor. The whole card is the link, so there's no eyebrow, blurb,
//     or button. Sits side-by-side with the WuWadle card in the home sister
//     row (and centered on its own on mode finish screens).
//   - compact — legacy slim layout, retained for sibling API parity (nothing
//     on OWdle passes it today).
const DEADLOCKLE_URL =
  "https://deadlockle.com/?utm_source=owdle&utm_medium=sister-site";

export function TryDeadlockleCard({ compact = false }: { compact?: boolean }) {
  if (compact) {
    return (
      <a
        href={DEADLOCKLE_URL}
        target="_blank"
        rel="noopener noreferrer"
        aria-label="Try Deadlockle, the daily Deadlock quiz (opens in a new tab)"
        className="group relative block cursor-pointer overflow-hidden border border-line bg-canvas p-4 transition-colors hover:bg-muted focus-visible:bg-muted active:bg-muted"
        style={{ touchAction: "manipulation", WebkitTapHighlightColor: "rgba(214,160,92,0.18)" }}
      >
        <div className="relative flex flex-col gap-3">
          <div className="flex-1">
            <p className="utility-label text-[10px] text-info">Sister site</p>
            <h3 className="mt-1 font-display text-xl text-ink">
              Play{" "}
              <span style={{ color: "#d6a05c" }}>
                Deadlock<span style={{ color: "#e9c694" }}>le</span>
              </span>
            </h3>
            <p className="mt-1.5 text-xs text-ink-soft">
              The daily Deadlock quiz. Same format, different game.
            </p>
          </div>
          <span className="utility-label inline-flex items-center gap-2 self-start border border-line bg-canvas px-3 py-2 text-xs text-ink transition-colors group-hover:border-edge group-hover:text-accent-soft">
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

  return (
    <a
      href={DEADLOCKLE_URL}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="Try Deadlockle, the daily Deadlock quiz (opens in a new tab)"
      className="group relative flex w-full max-w-xs flex-col items-center gap-1 rounded-(--radius-card) border border-[#33506a] bg-[#1c3243] p-5 text-center transition-[background-color,border-color,box-shadow] hover:border-[#4a6c88] hover:bg-[#223b4f] hover:shadow-[0_2px_10px_-4px_rgba(214,160,92,0.45)] focus-visible:border-[#4a6c88] active:bg-[#223b4f] sm:p-6"
      style={{ touchAction: "manipulation", WebkitTapHighlightColor: "rgba(214,160,92,0.14)" }}
    >
      <h3
        className="text-xl font-bold sm:text-2xl"
        style={{
          fontFamily: "var(--font-cinzel), ui-serif, Georgia, serif",
          color: "#f3e8d3",
        }}
      >
        Play <span style={{ color: "#e8be7f" }}>Deadlockle</span>
      </h3>
      <p
        className="text-xs font-medium"
        style={{
          fontFamily: "var(--font-cinzel), ui-serif, Georgia, serif",
          color: "#b6a98e",
        }}
      >
        The daily Deadlock quiz
      </p>
    </a>
  );
}
