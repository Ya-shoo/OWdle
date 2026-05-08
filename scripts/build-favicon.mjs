// Renders app/icon.svg into every favicon asset the platform needs:
//   - app/favicon.ico       (multi-resolution ICO for legacy browsers)
//   - app/apple-icon.png    (180×180 for iOS home-screen)
//   - app/icon0.png         (192×192 — Google SERP favicon)
//   - app/icon1.png         (512×512 — PWA install icon, high-DPI)
//
// Google specifically requires favicons at multiples of 48 (192 is the
// canonical size) to show in search results. The ICO + SVG alone gets
// rejected because the served frames are too small. icon0/icon1 use
// Next's app-icon file convention so Next emits the right <link> tags
// automatically with explicit sizes attributes.
//
// One-shot script — re-run when icon.svg changes.

import { readFile, writeFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const SVG_PATH = join(ROOT, "app", "icon.svg");
const ICO_PATH = join(ROOT, "app", "favicon.ico");
const APPLE_PATH = join(ROOT, "app", "apple-icon.png");
const ICON_192_PATH = join(ROOT, "app", "icon0.png");
const ICON_512_PATH = join(ROOT, "app", "icon1.png");

const ICO_SIZES = [16, 32, 48, 64, 128, 256];

async function svgToPng(svg, size) {
  return sharp(svg, { density: 384 })
    .resize(size, size, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();
}

// ICO format reference: https://en.wikipedia.org/wiki/ICO_(file_format)
// Header: 6 bytes. Per-image directory entry: 16 bytes. Then concatenated
// PNG buffers. We embed PNGs (supported since Vista) instead of BMP DIBs
// so we get full alpha and small file size.
function packIco(images) {
  const HEADER_SIZE = 6;
  const ENTRY_SIZE = 16;
  const dirSize = HEADER_SIZE + ENTRY_SIZE * images.length;
  const totalSize = dirSize + images.reduce((sum, { png }) => sum + png.length, 0);

  const out = Buffer.alloc(totalSize);
  // ICONDIR
  out.writeUInt16LE(0, 0); // reserved
  out.writeUInt16LE(1, 2); // type 1 = icon
  out.writeUInt16LE(images.length, 4);

  let offset = dirSize;
  images.forEach(({ size, png }, i) => {
    const entry = HEADER_SIZE + i * ENTRY_SIZE;
    // 0 in width/height fields means 256, which is the format quirk for
    // sizes that don't fit in a single byte.
    out.writeUInt8(size === 256 ? 0 : size, entry + 0);
    out.writeUInt8(size === 256 ? 0 : size, entry + 1);
    out.writeUInt8(0, entry + 2); // palette count (0 for 32bpp)
    out.writeUInt8(0, entry + 3); // reserved
    out.writeUInt16LE(1, entry + 4); // color planes
    out.writeUInt16LE(32, entry + 6); // bits per pixel
    out.writeUInt32LE(png.length, entry + 8);
    out.writeUInt32LE(offset, entry + 12);
    png.copy(out, offset);
    offset += png.length;
  });

  return out;
}

const svg = await readFile(SVG_PATH);

const frames = await Promise.all(
  ICO_SIZES.map(async (size) => ({ size, png: await svgToPng(svg, size) })),
);
await writeFile(ICO_PATH, packIco(frames));
console.log(`wrote ${ICO_PATH} (${frames.length} frames: ${ICO_SIZES.join(", ")})`);

const applePng = await svgToPng(svg, 180);
await writeFile(APPLE_PATH, applePng);
console.log(`wrote ${APPLE_PATH} (180×180)`);

const icon192 = await svgToPng(svg, 192);
await writeFile(ICON_192_PATH, icon192);
console.log(`wrote ${ICON_192_PATH} (192×192 — Google SERP)`);

const icon512 = await svgToPng(svg, 512);
await writeFile(ICON_512_PATH, icon512);
console.log(`wrote ${ICON_512_PATH} (512×512 — PWA install)`);
