import { ImageResponse } from "next/og";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

export const alt = "OWdle — the daily Overwatch hero quiz";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const dynamic = "force-static";

async function loadFontTtf(url: string) {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Failed to fetch font ${url}: ${res.status}`);
  }
  return res.arrayBuffer();
}

const SAIRA_BOLD_TTF =
  "https://raw.githubusercontent.com/google/fonts/main/ofl/sairacondensed/SairaCondensed-Bold.ttf";
const SAIRA_MEDIUM_TTF =
  "https://raw.githubusercontent.com/google/fonts/main/ofl/sairacondensed/SairaCondensed-Medium.ttf";

export default async function Image() {
  const [sairaBold, sairaMedium, splashBytes] = await Promise.all([
    loadFontTtf(SAIRA_BOLD_TTF),
    loadFontTtf(SAIRA_MEDIUM_TTF),
    readFile(join(process.cwd(), "public/splash/tracer.jpg")),
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
            opacity: 0.6,
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
          Daily · Overwatch · Wordle-style
        </div>
        <div
          style={{
            position: "absolute",
            top: 154,
            left: 64,
            display: "flex",
            fontSize: 280,
            fontWeight: 700,
            lineHeight: 0.9,
          }}
        >
          <span style={{ color: "#f5f1e6" }}>OW</span>
          <span style={{ color: "#ffa466" }}>dle</span>
        </div>
        <div
          style={{
            position: "absolute",
            top: 446,
            left: 70,
            display: "flex",
            fontSize: 42,
            fontWeight: 500,
            color: "#d2cdbf",
          }}
        >
          the daily Overwatch hero quiz
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
            playowdle.com
          </div>
        </div>
      </div>
    ),
    {
      ...size,
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
