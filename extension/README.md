# OWdle Daily Reminder (browser extension)

A lightweight Manifest V3 extension that sends **one notification per day** to
pull players back to [playowdle.com](https://playowdle.com):

1. **Streak at risk** — you have a live streak and haven't finished today's OWdle.
2. **Live reminder** — today's OWdle is up and you haven't played (no streak to protect).
3. **Feedback ask** — rare (≤ every 3 weeks), only on a day you already played.

Cross-browser: **Chrome/Edge** and **Firefox** ship from this one source tree;
**Safari** is a deferred later step (see below). Each store listing is also a
high-authority backlink + discovery surface for the site.

## How it knows your streak

An extension can't read the site's `localStorage` across contexts, and Firefox
and Safari don't support `externally_connectable`, so all three browsers use
the same handoff:

- The **site** writes a compact snapshot to `localStorage["owdle.reminder"]`
  (`{ current, longest, lastCompletedDay, todayDone, day }`) whenever it
  changes — see `components/ExtensionBridge.tsx` in the main repo.
- The extension's **content script** (`content.js`, injected on playowdle.com)
  reads that key and relays it to the background worker.

The background worker (`background.js`) compares it against the Pacific puzzle
day — the same 2:15am America/Los_Angeles roll the site uses (`daytime.js`,
ported from `lib/daily.ts`). Until the site has written the key once, it falls
back to a generic "it's live" reminder. Nothing flows back to the site.

## Files

| file | role |
|---|---|
| `manifest.json` | Base (Chrome/Edge) MV3 manifest. `build.mjs` derives the Firefox variant. |
| `background.js` | Schedules the daily alarm, decides + fires the notification, stores the snapshot. |
| `content.js` | Injected on playowdle.com; relays `localStorage["owdle.reminder"]`. |
| `daytime.js` | Pacific puzzle-day helpers, ported from the web app. |
| `popup.html` / `popup.js` | Toolbar popup: today's status + settings (time, streak-only, feedback toggle, test). |
| `icons/` | 16/48/128 icons (downscaled from the site's brand mark). |
| `build.mjs` | Emits `dist/chrome/` and `dist/firefox/`. |

Permissions: `alarms`, `notifications`, `storage`, plus a content script on
`playowdle.com` (the "read data on playowdle.com" prompt — single domain).

## Build

```
node build.mjs
```

Produces `dist/chrome/` and `dist/firefox/` (git-ignored). The base manifest is
Chrome-flavored (MV3 service worker), and the Firefox variant swaps the
background to an event page (`background.scripts`) and adds a `gecko` id.

## Test locally

**Chrome/Edge** — `chrome://extensions` → **Developer mode** → **Load
unpacked**. You can point it at this `extension/` folder directly (it's a valid
Chrome unpacked dir), or at `dist/chrome/` after building.

> Note: recent **Google Chrome** builds refuse the `--load-extension`
> command-line flag ("--load-extension is not allowed in Google Chrome"), so
> *scripted/automated* loading needs **Chrome for Testing** (or Chromium)
> instead. The **Load unpacked** UI above is unaffected and works in normal
> Chrome.

**Firefox** — `about:debugging` → **This Firefox** → **Load Temporary Add-on**
→ pick `dist/firefox/manifest.json`.

With `npm run dev` running, open `http://localhost:3000` (the content script
matches localhost) → your real streak syncs. Open the popup → **Send a test
notification** to confirm notifications work. To exercise the daily logic, set
the reminder hour to the current hour, or clear `lastNotifyDay` from the
extension's storage and reload.

## Publish

- **Chrome Web Store** — Developer Dashboard, one-time \$5 registration. Zip the
  **contents** of `dist/chrome/` and upload. Listing "Website" → `https://playowdle.com`.
- **Firefox (AMO)** — addons.mozilla.org, free. Zip the contents of
  `dist/firefox/` and upload; AMO signs it. Homepage → `https://playowdle.com`.

Neither store needs any post-publish change to the site — the localStorage
handoff doesn't depend on the extension's id.

## Safari (deferred)

Safari web extensions must be wrapped in a native app, code-signed with an
**Apple Developer account (\$99/yr)**, and shipped through the **App Store**.
The web code here is Safari-ready; when you're ready:

```
node build.mjs
xcrun safari-web-extension-converter dist/chrome
```

That generates an Xcode project you build, sign, and submit. Safari supports
MV3 service workers + `importScripts`, so the Chrome build is the right input.
