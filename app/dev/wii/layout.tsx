import type { Metadata } from "next";
import { Fredoka, M_PLUS_Rounded_1c } from "next/font/google";
import "./wii.css";

// M PLUS Rounded 1c is the closest free analogue to Rodin Pro NTLG, the
// face Nintendo licensed for the Wii UI. Coji Morishita designed it
// explicitly for friendly UI use, with the same balanced rounded
// terminals. It carries the body, UI controls, and small text.
const mplusRounded = M_PLUS_Rounded_1c({
  variable: "--wii-font-body",
  subsets: ["latin"],
  display: "swap",
  weight: ["400", "500", "700", "800"],
});

// Fredoka handles big display moments — channel labels, hero names in
// the win panel, the "OWdle" wordmark. Heavier and more bouncy than
// M PLUS, which gives the Wii Shop / Mii Channel kid-friendly weight.
const fredoka = Fredoka({
  variable: "--wii-font-display",
  subsets: ["latin"],
  display: "swap",
  weight: ["500", "600", "700"],
});

export const metadata: Metadata = {
  title: "Wii — OWdle (dev)",
  description: "Internal preview of an alternate Wii / Mii dark-mode UI.",
  // Keep the dev preview out of search results entirely.
  robots: { index: false, follow: false, nocache: true },
};

export default function WiiDevLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <div
      data-wii-scope
      className={`${mplusRounded.variable} ${fredoka.variable}`}
    >
      {children}
    </div>
  );
}
