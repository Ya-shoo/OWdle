// Assemble per-browser builds from the shared source + the right manifest.
//
//   node build.mjs
//
// Produces:
//   dist/chrome/   — load unpacked, or zip for the Chrome Web Store.
//   dist/firefox/  — load in about:debugging, or zip for addons.mozilla.org.
//
// Safari (deferred): run Apple's converter on the Chrome build once you have
// Xcode + an Apple Developer account:
//   xcrun safari-web-extension-converter dist/chrome
//
// The repo root (extension/) is itself a valid Chrome unpacked dir, so quick
// Chrome dev doesn't even need a build — this script is for clean, per-store
// packages and the Firefox variant.

import {
  readFileSync,
  writeFileSync,
  mkdirSync,
  rmSync,
  cpSync,
} from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = dirname(fileURLToPath(import.meta.url));
const DIST = join(ROOT, "dist");

// Everything the runtime needs, shared across browsers.
const SHARED = [
  "background.js",
  "content.js",
  "daytime.js",
  "popup.html",
  "popup.js",
  "icons",
];

const base = JSON.parse(readFileSync(join(ROOT, "manifest.json"), "utf8"));

function build(browser, transform) {
  const out = join(DIST, browser);
  rmSync(out, { recursive: true, force: true });
  mkdirSync(out, { recursive: true });
  for (const f of SHARED) {
    cpSync(join(ROOT, f), join(out, f), { recursive: true });
  }
  const manifest = transform(structuredClone(base));
  writeFileSync(
    join(out, "manifest.json"),
    JSON.stringify(manifest, null, 2) + "\n",
  );
  console.log("built", join("dist", browser));
}

// Chrome/Edge — the base manifest is already Chrome-flavored (MV3 service
// worker; background.js pulls daytime.js via importScripts).
build("chrome", (m) => m);

// Firefox — MV3 event page instead of a service worker: list the scripts to
// load (daytime.js first so its globals exist before background.js runs), and
// declare a gecko id for AMO signing.
build("firefox", (m) => {
  m.background = { scripts: ["daytime.js", "background.js"] };
  m.browser_specific_settings = {
    gecko: {
      id: "owdle-reminder@playowdle.com",
      strict_min_version: "121.0",
    },
  };
  return m;
});
