import type { Metadata } from "next";

export const SITE_URL = "https://playowdle.com";
export const SITE_NAME = "OWdle";
export const SITE_TAGLINE = "the daily Overwatch quiz";

export const SITE_DEFAULT_DESCRIPTION =
  "OWdle is the daily Overwatch hero quiz. Wordle-inspired modes — guess the hero by attributes, ability icons, splash art, and voice lines. New puzzles every day at midnight UTC.";

// Support/tip links for the home-page engagement section. Yash to update
// the Ko-fi handle once an account exists. SHARE_TEXT is consumed by the
// Twitter/X intent on the same panel.
export const SUPPORT_LINKS = {
  kofi: "https://ko-fi.com/yashpa",
} as const;

export const SHARE_TEXT =
  "Playing OWdle — the daily Overwatch hero quiz. Six modes, one hero.";

export const SITE_KEYWORDS = [
  "Overwatch quiz",
  "Overwatch wordle",
  "OWdle",
  "Overwatch 2 quiz",
  "guess the Overwatch hero",
  "daily Overwatch hero quiz",
  "Overwatch hero guesser",
  "Overwatch trivia",
  "Overwatch ability quiz",
  "Overwatch splash art quiz",
  "Overwatch voice line quiz",
  "Loldle for Overwatch",
];

type ModeMetaInput = {
  slug: string;
  title: string;
  description: string;
};

const OG_IMAGE = {
  url: "/opengraph-image",
  width: 1200,
  height: 630,
  alt: "OWdle — the daily Overwatch hero quiz",
  type: "image/png",
} as const;

export function modeMetadata({
  slug,
  title,
  description,
}: ModeMetaInput): Metadata {
  const canonical = `/${slug}/`;
  const fullUrl = `${SITE_URL}${canonical}`;
  const ogTitle = `${title} · ${SITE_NAME}`;
  return {
    title,
    description,
    alternates: { canonical },
    openGraph: {
      type: "website",
      siteName: SITE_NAME,
      url: fullUrl,
      title: ogTitle,
      description,
      locale: "en_US",
      images: [OG_IMAGE],
    },
    twitter: {
      card: "summary_large_image",
      title: ogTitle,
      description,
      images: [OG_IMAGE.url],
    },
  };
}
