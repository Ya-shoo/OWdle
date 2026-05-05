// Tip-jar / support panel that pairs with RequestNextGame in the
// engagement section. Links live in lib/site.ts so they can be tweaked
// without touching the component.
import { SUPPORT_LINKS, SHARE_TEXT, SITE_URL } from "@/lib/site";

const TWITTER_INTENT = `https://twitter.com/intent/tweet?text=${encodeURIComponent(
  SHARE_TEXT,
)}&url=${encodeURIComponent(SITE_URL)}`;

export function SupportLinks() {
  return (
    <div className="flex h-full flex-col">
      <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-info">
        Support the project
      </p>
      <h3 className="mt-2 font-display text-xl text-ink sm:text-2xl">
        Like the daily? Back the next one.
      </h3>
      <p className="mt-2 text-sm text-ink-soft">
        OWdle is a solo side project — no ads, no signup, no tracking. If
        you want to keep new modes (and new games) coming:
      </p>

      <div className="mt-5 flex flex-wrap gap-2">
        <a
          href={SUPPORT_LINKS.kofi}
          target="_blank"
          rel="noopener noreferrer"
          className="group inline-flex items-center gap-2 bg-accent px-4 py-2 font-mono text-[11px] uppercase tracking-[0.22em] text-on-accent transition-colors hover:bg-accent-soft"
        >
          <KofiMark />
          Tip on Ko-fi
        </a>
        <a
          href={TWITTER_INTENT}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 border border-line bg-canvas px-4 py-2 font-mono text-[11px] uppercase tracking-[0.22em] text-ink transition-colors hover:border-edge hover:text-accent-soft"
        >
          <ShareMark />
          Share on X
        </a>
      </div>

      <p className="mt-4 font-mono text-[10px] uppercase tracking-[0.18em] text-ink-faint">
        Or just tell a friend — every player helps.
      </p>
    </div>
  );
}

function KofiMark() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" aria-hidden>
      <path
        d="M3 7h15a3 3 0 0 1 0 6h-1M3 7v8a3 3 0 0 0 3 3h8a3 3 0 0 0 3-3v-2"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="square"
        strokeLinejoin="miter"
      />
      <path
        d="M7 4v2M11 4v2"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="square"
      />
    </svg>
  );
}

function ShareMark() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" aria-hidden>
      <path
        d="M3 3h6v2H5v14h14v-4h2v6H3z M14 3h7v7h-2V6.4L11.4 14 10 12.6 17.6 5H14z"
        fill="currentColor"
      />
    </svg>
  );
}
