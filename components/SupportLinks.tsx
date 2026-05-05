// Tip-jar panel that pairs with RequestNextGame in the engagement strip.
// Stacks vertically inside its column: heading + copy on top, Ko-fi
// profile preview + tip button + share link below. The Ko-fi action opens
// an in-page modal containing Ko-fi's official panel iframe — see KofiModal.
import { SUPPORT_LINKS, SHARE_TEXT, SITE_URL } from "@/lib/site";
import { KofiModal } from "./KofiModal";

const TWITTER_INTENT = `https://twitter.com/intent/tweet?text=${encodeURIComponent(
  SHARE_TEXT,
)}&url=${encodeURIComponent(SITE_URL)}`;

export function SupportLinks() {
  return (
    <div className="flex h-full flex-col">
      <h3 className="font-soft text-2xl font-bold text-ink sm:text-3xl">
        Support me :D
      </h3>
      <p className="mt-2 text-sm text-ink-soft">
        Daily puzzles take time. If OWdle made your day, slide a coffee my way {'( ๑‾̀◡‾́)σ"'}
      </p>

      {/* Action cluster — centered horizontally within the column so the
          avatar+name and Ko-fi button form a clear vertical focal point
          beneath the heading copy. */}
      <div className="mt-6 flex flex-col items-center gap-5">
        {/* Ko-fi profile-card preview — anchors the tip button so visitors
            see who they'd be supporting before they click. */}
        <div className="flex items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/kofi-avatar.jpg"
            alt=""
            width={56}
            height={56}
            className="h-14 w-14 shrink-0 rounded-full border border-line object-cover"
          />
          <div>
            <p className="font-soft text-base font-bold leading-none text-ink">
              yush
            </p>
            <p className="mt-1.5 text-xs text-ink-soft">ko-fi.com/yushoo</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
          <KofiModal username={SUPPORT_LINKS.kofiUsername} />
          <a
            href={TWITTER_INTENT}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-[0.2em] text-ink-soft transition-colors hover:text-info"
          >
            <ShareMark />
            Share on X
          </a>
        </div>
      </div>
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
