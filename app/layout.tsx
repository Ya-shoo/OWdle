import type { Metadata, Viewport } from "next";
import {
  Saira_Condensed,
  IBM_Plex_Sans,
  IBM_Plex_Mono,
  Bricolage_Grotesque,
  Cinzel,
  Noto_Sans,
} from "next/font/google";
import "./globals.css";
import { Header } from "@/components/Header";
import { SiteFooter } from "@/components/SiteFooter";
import { FeedbackButton } from "@/components/FeedbackButton";
import { ShareAnnounceModal } from "@/components/ShareAnnounceModal";
import { DevThemeSwitcher } from "@/components/DevThemeSwitcher";
import { AdRails } from "@/components/AdRails";
import { GoogleAnalytics } from "@/components/GoogleAnalytics";
import { GoogleAdsense } from "@/components/GoogleAdsense";
import { THEME_INLINE_SCRIPT } from "@/lib/theme";
import {
  SITE_DEFAULT_DESCRIPTION,
  SITE_KEYWORDS,
  SITE_NAME,
  SITE_URL,
} from "@/lib/site";

const saira = Saira_Condensed({
  variable: "--font-saira",
  subsets: ["latin"],
  display: "swap",
  weight: ["400", "500", "600", "700"],
});

const plexSans = IBM_Plex_Sans({
  variable: "--font-plex-sans",
  subsets: ["latin"],
  display: "swap",
  weight: ["300", "400", "500", "600"],
});

const plexMono = IBM_Plex_Mono({
  variable: "--font-plex-mono",
  subsets: ["latin"],
  display: "swap",
  weight: ["400", "500"],
});

// Soft accent face — used sparingly for warm headline moments
// (engagement cards, daily-complete celebration). Keeps the rest of the
// page structural so this lands as warmth rather than inconsistency.
const bricolage = Bricolage_Grotesque({
  variable: "--font-bricolage",
  subsets: ["latin"],
  display: "swap",
  weight: ["600", "700", "800"],
});

// Sister-site typefaces — loaded only so the cross-promo cards can render
// each destination in its real display face: Cinzel is Deadlockle's, Noto
// Sans is WuWadle's. Minimal weights; used solely by TryDeadlockleCard /
// TryWuWadleCard, keep in lockstep with the sibling repos' layouts.
const cinzel = Cinzel({
  variable: "--font-cinzel",
  subsets: ["latin"],
  display: "swap",
  weight: ["500", "700"],
});

const notoSans = Noto_Sans({
  variable: "--font-noto-sans",
  subsets: ["latin"],
  display: "swap",
  weight: ["500", "700"],
});

// Home <title> is tuned for search intent: it leads with the brand, then
// the highest-volume phrases players actually type ("Overwatch Wordle",
// "guess the hero"), while staying under ~60 chars so Google doesn't clip
// it. Sub-pages fall back to the `%s · OWdle` template defined below.
const homeTitle = `${SITE_NAME}: The Daily Overwatch Wordle Game | Guess the Hero`;

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: homeTitle,
    template: `%s · ${SITE_NAME}`,
  },
  description: SITE_DEFAULT_DESCRIPTION,
  applicationName: SITE_NAME,
  keywords: SITE_KEYWORDS,
  authors: [{ name: SITE_NAME, url: SITE_URL }],
  creator: SITE_NAME,
  publisher: SITE_NAME,
  category: "games",
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    siteName: SITE_NAME,
    url: SITE_URL,
    title: homeTitle,
    description: SITE_DEFAULT_DESCRIPTION,
    locale: "en_US",
  },
  twitter: {
    card: "summary_large_image",
    title: homeTitle,
    description: SITE_DEFAULT_DESCRIPTION,
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-snippet": -1,
      "max-video-preview": -1,
    },
  },
  // Site-ownership token for the alldle.net game-directory listing. Renders
  // <meta name="alldle-verify" content="…"> via Next's metadata API.
  verification: {
    other: {
      "alldle-verify": "BlBuuflcX2b65wWTUC7iJvwcaQQKLx4y",
    },
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#0a0e14" },
    { media: "(prefers-color-scheme: light)", color: "#f26522" },
  ],
  colorScheme: "dark",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="en"
      className={`${saira.variable} ${plexSans.variable} ${plexMono.variable} ${bricolage.variable} ${cinzel.variable} ${notoSans.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <head>
        <script
          dangerouslySetInnerHTML={{ __html: THEME_INLINE_SCRIPT }}
        />
      </head>
      <body className="min-h-full flex flex-col">
        <Header />
        {children}
        <SiteFooter />
        <FeedbackButton />
        <ShareAnnounceModal />
        <AdRails />
        <DevThemeSwitcher />
        <GoogleAnalytics />
        <GoogleAdsense />
      </body>
    </html>
  );
}
