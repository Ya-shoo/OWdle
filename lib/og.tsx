import { ImageResponse } from "next/og";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { SITE_NAME } from "@/lib/site";

// Saira Condensed matches the site's display face. Fetched from the upstream
// Google Fonts repo so the OG route can run during static build without
// shipping the TTFs into the repo.
const SAIRA_BOLD_TTF =
  "https://raw.githubusercontent.com/google/fonts/main/ofl/sairacondensed/SairaCondensed-Bold.ttf";
const SAIRA_MEDIUM_TTF =
  "https://raw.githubusercontent.com/google/fonts/main/ofl/sairacondensed/SairaCondensed-Medium.ttf";

async function loadFontTtf(url: string) {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Failed to fetch font ${url}: ${res.status}`);
  }
  return res.arrayBuffer();
}

export const OG_SIZE = { width: 1200, height: 630 } as const;
export const OG_CONTENT_TYPE = "image/png";

type ModeOgInput = {
  // File name in public/splash/ — e.g. "tracer.jpg".
  heroSplash: string;
  // The mode's display label. Becomes the dominant headline.
  modeLabel: string;
  // The mode's short blurb. Becomes the subhead. Use the existing
  // copy from MODES so this stays in sync.
  modeBlurb: string;
  // The mode slug. Used in the bottom-right URL stamp.
  slug: string;
};

export async function renderModeOgImage({
  heroSplash,
  modeLabel,
  modeBlurb,
  slug,
}: ModeOgInput) {
  const [sairaBold, sairaMedium, splashBytes] = await Promise.all([
    loadFontTtf(SAIRA_BOLD_TTF),
    loadFontTtf(SAIRA_MEDIUM_TTF),
    readFile(join(process.cwd(), `public/splash/${heroSplash}`)),
  ]);
  const splashSrc = `data:image/jpeg;base64,${splashBytes.toString("base64")}`;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          position: "relative",
          background: "#0a0d11",
          fontFamily: "Saira Condensed",
          color: "#e8e6df",
        }}
      >
        <img
          src={splashSrc}
          width={1200}
          height={630}
          style={{
            position: "absolute",
            inset: 0,
            objectFit: "cover",
            objectPosition: "center 28%",
            opacity: 0.55,
          }}
        />
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            background:
              "linear-gradient(90deg, rgba(10,13,17,0.94) 0%, rgba(10,13,17,0.82) 38%, rgba(10,13,17,0.30) 100%)",
          }}
        />
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            background:
              "linear-gradient(180deg, rgba(10,13,17,0.55) 0%, rgba(10,13,17,0) 22%, rgba(10,13,17,0) 70%, rgba(10,13,17,0.85) 100%)",
          }}
        />
        <div
          style={{
            position: "absolute",
            top: 60,
            left: 72,
            display: "flex",
            fontSize: 22,
            letterSpacing: 8,
            textTransform: "uppercase",
            color: "#9aa4b1",
            fontWeight: 500,
          }}
        >
          {SITE_NAME}
        </div>
        <div
          style={{
            position: "absolute",
            top: 150,
            left: 64,
            display: "flex",
            fontSize: 200,
            fontWeight: 700,
            lineHeight: 0.9,
            color: "#ffa466",
          }}
        >
          {modeLabel}
        </div>
        <div
          style={{
            position: "absolute",
            top: 400,
            left: 70,
            right: 72,
            display: "flex",
            fontSize: 36,
            fontWeight: 500,
            color: "#d2cdbf",
            lineHeight: 1.2,
          }}
        >
          {modeBlurb}
        </div>
        <div
          style={{
            position: "absolute",
            bottom: 56,
            left: 72,
            right: 72,
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-end",
            fontSize: 24,
            fontWeight: 500,
          }}
        >
          <div style={{ display: "flex", color: "#a39d8e", gap: 14 }}>
            <span>Classic</span>
            <span style={{ color: "#4d535b" }}>·</span>
            <span>Quote</span>
            <span style={{ color: "#4d535b" }}>·</span>
            <span>Ability</span>
            <span style={{ color: "#4d535b" }}>·</span>
            <span>Spotlight</span>
            <span style={{ color: "#4d535b" }}>·</span>
            <span>Sound</span>
          </div>
          <div
            style={{
              display: "flex",
              color: "#ffa466",
              letterSpacing: 4,
              textTransform: "lowercase",
            }}
          >
            playowdle.com/{slug}
          </div>
        </div>
      </div>
    ),
    {
      ...OG_SIZE,
      fonts: [
        {
          name: "Saira Condensed",
          data: sairaBold,
          style: "normal",
          weight: 700,
        },
        {
          name: "Saira Condensed",
          data: sairaMedium,
          style: "normal",
          weight: 500,
        },
      ],
    },
  );
}
