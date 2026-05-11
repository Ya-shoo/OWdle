// Generates mobile + desktop AVIF/WebP variants of every banner so the home
// page can serve a properly-sized image to phones via <picture> srcset.
// Originals (key-art .webp, maps .jpg) stay in place as the universal fallback;
// the variants live beside them with .mobile.{avif,webp} / .desktop.{avif,webp}
// suffixes. Filenames are derived at runtime from the original file path —
// banners.json doesn't need to change.
//
// Run: node scripts/build-banner-variants.mjs
// Idempotent: skips a variant if the destination already exists and is newer
// than the source. Pass --force to regenerate everything.

import { readFile, writeFile, stat, access } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT = resolve(__dirname, "..");
const MANIFEST = resolve(PROJECT, "data", "banners.json");

const MOBILE_W = 768;
const DESKTOP_W = 1920;
const FORCE = process.argv.includes("--force");

async function exists(p) {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
}

async function isFresh(src, dst) {
  if (FORCE) return false;
  if (!(await exists(dst))) return false;
  const [s, d] = await Promise.all([stat(src), stat(dst)]);
  return d.mtimeMs >= s.mtimeMs;
}

async function variant(srcPath, dstPath, format, width) {
  if (await isFresh(srcPath, dstPath)) return null;
  const buf = await readFile(srcPath);
  const pipeline = sharp(buf).resize({
    width,
    withoutEnlargement: true,
  });
  if (format === "avif") {
    await pipeline.avif({ quality: 50, effort: 6 }).toFile(dstPath);
  } else {
    await pipeline.webp({ quality: 78, effort: 5 }).toFile(dstPath);
  }
  return (await stat(dstPath)).size;
}

function variantPaths(file) {
  const m = file.match(/^(.*)\.(jpg|jpeg|png|webp)$/i);
  if (!m) throw new Error(`Unexpected banner file: ${file}`);
  const base = m[1];
  return {
    mobileAvif: `${base}.mobile.avif`,
    mobileWebp: `${base}.mobile.webp`,
    desktopAvif: `${base}.desktop.avif`,
    desktopWebp: `${base}.desktop.webp`,
  };
}

async function main() {
  const manifest = JSON.parse(await readFile(MANIFEST, "utf8"));
  const banners = [...(manifest.keyArt ?? []), ...(manifest.maps ?? [])];
  console.log(
    `Building variants for ${banners.length} banners (mobile=${MOBILE_W}, desktop=${DESKTOP_W})…`,
  );

  let totalSrc = 0;
  let totalOut = 0;
  let built = 0;
  let skipped = 0;
  for (const b of banners) {
    const srcRel = b.file.replace(/^\//, "");
    const srcPath = resolve(PROJECT, "public", srcRel);
    const v = variantPaths(srcPath);
    const srcSize = (await stat(srcPath)).size;
    totalSrc += srcSize;

    const tasks = [
      variant(srcPath, v.mobileAvif, "avif", MOBILE_W),
      variant(srcPath, v.mobileWebp, "webp", MOBILE_W),
      variant(srcPath, v.desktopAvif, "avif", DESKTOP_W),
      variant(srcPath, v.desktopWebp, "webp", DESKTOP_W),
    ];
    const results = await Promise.all(tasks);
    const builtHere = results.filter((r) => r != null).length;
    if (builtHere > 0) built += builtHere;
    else skipped += 1;

    const sizes = await Promise.all(
      [v.mobileAvif, v.mobileWebp, v.desktopAvif, v.desktopWebp].map((p) =>
        stat(p).then((s) => s.size),
      ),
    );
    const out = sizes.reduce((a, b) => a + b, 0);
    totalOut += out;

    console.log(
      `  ${b.key.padEnd(28)} src ${(srcSize / 1024).toFixed(0).padStart(4)} KB  →  ` +
        `mAVIF ${(sizes[0] / 1024).toFixed(0).padStart(3)}  ` +
        `mWEBP ${(sizes[1] / 1024).toFixed(0).padStart(3)}  ` +
        `dAVIF ${(sizes[2] / 1024).toFixed(0).padStart(3)}  ` +
        `dWEBP ${(sizes[3] / 1024).toFixed(0).padStart(3)} KB` +
        (builtHere === 0 ? "  (cached)" : ""),
    );
  }

  console.log(
    `\nDone. Built ${built} variant files; ${skipped} banners already up-to-date.`,
  );
  console.log(
    `Originals total: ${(totalSrc / 1024 / 1024).toFixed(2)} MB. ` +
      `Variants total: ${(totalOut / 1024 / 1024).toFixed(2)} MB.`,
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
