// Tip-jar / support panel that pairs with RequestNextGame in the
// engagement section. The Ko-fi action opens an in-page modal containing
// Ko-fi's official panel iframe — see KofiModal. Share button is a
// plain Twitter intent link.
import { SUPPORT_LINKS, SHARE_TEXT, SITE_URL } from "@/lib/site";
import { KofiModal } from "./KofiModal";

const TWITTER_INTENT = `https://twitter.com/intent/tweet?text=${encodeURIComponent(
  SHARE_TEXT,
)}&url=${encodeURIComponent(SITE_URL)}`;

export function SupportLinks() {
  return (
    <div className="flex h-full flex-col">
      <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-info">
        Support the project
      </p>
      <h3 className="mt-2 font-soft text-xl font-bold text-ink sm:text-2xl">
        Like the daily? Back the next one.
      </h3>
      <p className="mt-2 text-sm text-ink-soft">
        OWdle is a solo side project — no ads, no signup, no tracking. If
        you want to keep new modes (and new games) coming:
      </p>

      <div className="mt-5 flex flex-wrap gap-2">
        <KofiModal username={SUPPORT_LINKS.kofiUsername} />
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
