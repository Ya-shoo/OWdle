"use client";

// Tip-jar panel. Sits centered on the homepage below the FAQ (the vote
// widget it used to pair with moved to /whats-next). Stacks vertically:
// heading + copy on top, Ko-fi profile preview + tip button + share link
// below. The Ko-fi action opens an in-page modal containing Ko-fi's
// official panel iframe — see KofiModal. The blurb carries a condensed
// version of the origin story (full version parked in MakerNote.tsx),
// with Sound linked since it's the origin mode.
//
// The panel renders on an inverted soft blue-white "paper" card (see
// HomeContent), so text here is dark-on-light: token inversions
// (text-canvas for strong text) plus fixed on-light hexes for the muted
// slate + link/hover tiers, mirroring how the sister-site cards hardcode
// their own on-light palettes.
import Link from "next/link";
import { SUPPORT_LINKS, SHARE_TEXT, SITE_URL } from "@/lib/site";
import { trackShareClicked } from "@/lib/tracking";
import { KofiModal } from "./KofiModal";

const TWITTER_INTENT = `https://twitter.com/intent/tweet?text=${encodeURIComponent(
  SHARE_TEXT,
)}&url=${encodeURIComponent(SITE_URL)}`;

export function SupportLinks() {
  return (
    <div className="flex h-full flex-col justify-center">
      <h3 className="font-soft text-2xl font-bold text-canvas sm:text-3xl">
        Support me :D
      </h3>
      <div className="mt-2 space-y-2 text-sm text-[#4a5b74]">
        <p>
          I started this site just for me and my friends.{" "}
          <Link
            href="/sound/"
            className="text-[#c2410c] underline underline-offset-2 transition-colors hover:text-accent"
          >
            Sound
          </Link>{" "}
          was the first mode I built, and it&rsquo;s still my favorite.
        </p>
        <p>
          Daily puzzles take time. If OWdle made your day, slide a coffee my
          way {'( ๑‾̀◡‾́)σ"'}
        </p>
      </div>

      {/* Action cluster — every child centers on the column's vertical axis
          so the avatar+name, Ko-fi button, and share link form one unbroken
          focal column beneath the heading copy. */}
      <div className="mt-7 flex flex-col items-center gap-6">
        {/* Ko-fi profile-card preview — anchors the tip button so visitors
            see who they'd be supporting before they click. */}
        <div className="flex items-center gap-5">
          {/* Avatar doubles as a quick hop to the creator's Instagram —
              same destination as the IG icon below, but a much bigger
              tap target on mobile. The wrapping div hosts a hover-reveal
              speech bubble; the avatar itself keeps its scale-only press
              animation. */}
          <div className="group relative shrink-0">
            <a
              href="https://www.instagram.com/hiamyush/"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Creator's Instagram"
              className="block rounded-full transition-transform duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] hover:scale-[1.04] active:scale-[0.98]"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/kofi-avatar.jpg?v=2"
                alt=""
                width={112}
                height={112}
                className="h-28 w-28 rounded-full object-cover"
              />
            </a>
            {/* Speech bubble — pops in on avatar hover / keyboard focus.
                Anchored to the avatar's top-right so it floats up and
                away from the support copy. Tail points down-left at the
                avatar from the bubble's bottom-left corner. Inverted the
                other way now that the card is light: dark bg-canvas bubble
                with cream text. pointer-events-none so the cursor passing
                up onto the bubble doesn't strand the avatar's hover
                state. */}
            <div
              role="tooltip"
              className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-3 w-48 origin-bottom-left scale-90 rounded-2xl border border-line bg-canvas px-3 py-2 text-center font-soft text-xs leading-snug text-ink opacity-0 shadow-[0_6px_16px_-4px_rgba(0,0,0,0.45)] transition-all duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] group-hover:scale-100 group-hover:opacity-100 group-focus-within:scale-100 group-focus-within:opacity-100"
            >
              hi im yush! I like playing games and building fun things for me & my friends ^_^
              <span
                aria-hidden
                className="absolute left-4 top-full -mt-1.5 h-3 w-3 rotate-45 border-b border-r border-line bg-canvas"
              />
            </div>
          </div>
          <div>
            <p className="font-soft text-2xl font-bold leading-none text-canvas">
              yush
            </p>
            <p className="mt-2 text-base text-[#4a5b74]">ko-fi.com/yushoo</p>
            {/* Personal social icons — signal a real human behind the tip jar.
                Universal HTTPS links so iOS/Android open the X & Instagram
                apps automatically when installed, falling back to the web. */}
            {/* Icons themselves are 16px; the surrounding -mx-1.5 / p-1.5
                pads each link out to a ~28px tap area without visually
                shifting the cluster. */}
            <div className="-mx-1.5 mt-1 flex items-center gap-1">
              <a
                href="https://x.com/hiamYush"
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Creator on X"
                className="inline-flex items-center justify-center p-1.5 text-[#4a5b74] transition-colors hover:text-[#1d7ab0]"
              >
                <XMark />
              </a>
              <a
                href="https://www.instagram.com/hiamyush/"
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Creator on Instagram"
                className="inline-flex items-center justify-center p-1.5 transition-opacity hover:opacity-80"
              >
                <InstagramMark />
              </a>
            </div>
          </div>
        </div>
        <KofiModal username={SUPPORT_LINKS.kofiUsername} />
        <a
          href={TWITTER_INTENT}
          target="_blank"
          rel="noopener noreferrer"
          onClick={() => {
            trackShareClicked({
              surface: "support_panel",
              method: "twitter_intent",
            });
          }}
          className="-mt-1 inline-flex items-center gap-1.5 utility-label text-[11px] text-[#4a5b74] transition-colors hover:text-[#1d7ab0]"
        >
          <ShareMark />
          Share on X
        </a>
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

function XMark() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden>
      <path
        d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"
        fill="currentColor"
      />
    </svg>
  );
}

function InstagramMark() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden fill="none">
      <defs>
        <linearGradient
          id="instagram-brand-gradient"
          x1="0%"
          y1="0%"
          x2="100%"
          y2="100%"
        >
          <stop offset="0%" stopColor="#515BD4" />
          <stop offset="25%" stopColor="#833AB4" />
          <stop offset="50%" stopColor="#DD2A7B" />
          <stop offset="75%" stopColor="#FD1D1D" />
          <stop offset="100%" stopColor="#FCAF45" />
        </linearGradient>
      </defs>
      <rect
        x="2.5"
        y="2.5"
        width="19"
        height="19"
        rx="5"
        stroke="url(#instagram-brand-gradient)"
        strokeWidth="1.8"
      />
      <circle
        cx="12"
        cy="12"
        r="4.2"
        stroke="url(#instagram-brand-gradient)"
        strokeWidth="1.8"
      />
      <circle
        cx="17.6"
        cy="6.4"
        r="1.1"
        fill="url(#instagram-brand-gradient)"
      />
    </svg>
  );
}
