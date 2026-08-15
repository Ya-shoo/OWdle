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
import { SUPPORT_LINKS, BUSINESS_EMAIL } from "@/lib/site";
import { KofiModal } from "./KofiModal";

export function SupportLinks() {
  return (
    <div className="flex h-full flex-col justify-center">
      <h3 className="text-center font-soft text-xl font-bold text-canvas sm:text-2xl">
        Support me :D
      </h3>
      <div className="mt-2 text-center text-sm text-[#4a5b74]">
        <p>
          Daily puzzles take time. If OWdle made your day, slide a coffee my
          way {'( ๑‾̀◡‾́)σ"'}
        </p>
      </div>

      {/* Action cluster — every child centers on the column's vertical axis
          so the avatar+name, Ko-fi button, and share link form one unbroken
          focal column beneath the heading copy. */}
      <div className="mt-5 flex flex-col items-center gap-4">
        {/* Ko-fi profile-card preview — anchors the tip button so visitors
            see who they'd be supporting before they click. */}
        <div className="flex items-center gap-4">
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
                width={96}
                height={96}
                className="h-24 w-24 rounded-full object-cover"
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
            <p className="font-soft text-xl font-bold leading-none text-canvas">
              yush
            </p>
            <p className="mt-1.5 text-sm text-[#4a5b74]">ko-fi.com/yushoo</p>
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
      </div>

      {/* Business inquiries — sits at the very bottom of the card, centered,
          in strong dark text (text-canvas reads black on this light paper
          card). Separate from the support cluster above: this is the
          sponsorship / partnership channel, not a tip prompt. */}
      <p className="mt-6 text-center text-sm font-extrabold text-canvas">
        for business inquiries:{" "}
        <a
          href={`mailto:${BUSINESS_EMAIL}`}
          className="text-[#1d4ed8] transition-colors hover:text-[#1e3a8a]"
        >
          {BUSINESS_EMAIL}
        </a>
      </p>
    </div>
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
