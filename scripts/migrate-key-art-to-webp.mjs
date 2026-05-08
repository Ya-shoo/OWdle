// One-shot migration: convert existing key-art JPGs to WebP, rewrite the
// banners.json manifest to point at .webp, and delete the source JPGs.
// build-banners.mjs is now WebP-native, so future rebuilds skip this path.

import { readFile, writeFile, readdir, unlink } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const __dirname = dirname(fileURLToPath(import.meta.url));
const KEY_ART_DIR = resolve(__dirname, "..", "public", "banners", "key-art");
const MANIFEST = resolve(__dirname, "..", "data", "banners.json");

async function main() {
  const files = (await readdir(KEY_ART_DIR)).filter((f) => f.endsWith(".jpg"));
  console.log(`Converting ${files.length} key-art JPGs to WebP…`);

  let totalBefore = 0;
  let totalAfter = 0;
  for (const f of files) {
    const jpgPath = resolve(KEY_ART_DIR, f);
    const webpPath = jpgPath.replace(/\.jpg$/, ".webp");
    const buf = await readFile(jpgPath);
    await sharp(buf).webp({ quality: 82, effort: 5 }).toFile(webpPath);
    const before = buf.byteLength;
    const after = (await readFile(webpPath)).byteLength;
    totalBefore += before;
    totalAfter += after;
    console.log(
      `  ${f.padEnd(36)} ${(before / 1024).toFixed(0).padStart(4)} KB → ${(after / 1024).toFixed(0).padStart(4)} KB  (${Math.round((100 * (before - after)) / before)}% smaller)`,
    );
    await unlink(jpgPath);
  }

  const manifest = JSON.parse(await readFile(MANIFEST, "utf8"));
  for (const entry of manifest.keyArt) {
    entry.file = entry.file.replace(/\.jpg$/, ".webp");
  }
  await writeFile(MANIFEST, JSON.stringify(manifest, null, 2));

  console.log(
    `\nTotal: ${(totalBefore / 1024 / 1024).toFixed(2)} MB → ${(totalAfter / 1024 / 1024).toFixed(2)} MB (${Math.round((100 * (totalBefore - totalAfter)) / totalBefore)}% smaller)`,
  );
  console.log("Manifest updated.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
