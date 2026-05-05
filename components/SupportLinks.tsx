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
      <h3 className="font-soft text-2xl font-bold text-ink sm:text-3xl">
        Support me <span className="text-accent-soft">:D</span>
      </h3>

      {/* Centered Ko-fi button is the whole point of the card — we let
          flex-1 push it into the empty vertical space so this side mirrors
          the height of the leaderboard side. */}
      <div className="mt-2 flex flex-1 items-center justify-center py-6">
        <KofiModal username={SUPPORT_LINKS.kofiUsername} />
      </div>

      <a
        href={TWITTER_INTENT}
        target="_blank"
        rel="noopener noreferrer"
        className="mt-2 inline-flex items-center gap-1.5 self-start font-mono text-[10px] uppercase tracking-[0.2em] text-ink-faint transition-colors hover:text-info"
      >
        <ShareMark />
        Share on X
      </a>
    </div>
  );
}

function ShareMark() {
  return (
    <svg width="10" height="10" viewBox="0 0 24 24" aria-hidden>
      <path
        d="M3 3h6v2H5v14h14v-4h2v6H3z M14 3h7v7h-2V6.4L11.4 14 10 12.6 17.6 5H14z"
        fill="currentColor"
      />
    </svg>
  );
}
