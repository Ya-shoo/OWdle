// Ad-blocker presence detection for the ghost-rail inventory measurement
// (components/AdRails.tsx). Two independent baits, because blockers work
// at two different layers and we want to know which (NitroPay-style
// "acceptable ads" recovery beats network blocking but not cosmetic
// hiding, so the split changes the revenue math):
//
// - cosmetic: an element carrying the class names every filter list hides
//   (EasyList et al). If the engine hides or removes it, the visitor's
//   blocker would also hide rendered ad slots.
// - network: a no-cors fetch of adsbygoogle.js — the single most
//   universally blocklisted URL on the web. An opaque success means
//   requests to ad servers get through; a synchronous TypeError means an
//   extension intercepted it.
//
// Results are cached in sessionStorage so repeat pageviews within a
// session skip the probes, and memoized in-module so concurrent callers
// share one run. `null` means "couldn't determine" (probe timed out,
// storage unavailable mid-flight) — analysis treats it as unknown, not
// as either verdict.
//
// This file ships IDENTICALLY (minus the storage key prefix) in the
// Deadlockle repo — keep them in lockstep.

export type AdblockResult = {
  cosmetic: boolean | null;
  network: boolean | null;
};

const STORAGE_KEY = "owdle.adblock.v1";

let inFlight: Promise<AdblockResult> | null = null;

export function detectAdblock(): Promise<AdblockResult> {
  if (typeof window === "undefined") {
    return Promise.resolve({ cosmetic: null, network: null });
  }
  if (!inFlight) inFlight = run();
  return inFlight;
}

async function run(): Promise<AdblockResult> {
  try {
    const cached = window.sessionStorage.getItem(STORAGE_KEY);
    if (cached) return JSON.parse(cached) as AdblockResult;
  } catch {
    // Storage unavailable — probe anyway, just without the cache.
  }
  const [cosmetic, network] = await Promise.all([
    cosmeticBait(),
    networkBait(),
  ]);
  const result: AdblockResult = { cosmetic, network };
  try {
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(result));
  } catch {
    // Best-effort cache only.
  }
  return result;
}

function cosmeticBait(): Promise<boolean | null> {
  return new Promise((resolve) => {
    try {
      const bait = document.createElement("div");
      // The exact class vocabulary cosmetic filter lists target. Our real
      // ghost slots deliberately avoid these names (data-rail-slot) so a
      // blocker hides THIS element, never the probes we're measuring.
      bait.className = "adsbox ad-banner ad-placement textads pub_300x250";
      bait.style.cssText =
        "position:absolute;left:-9999px;top:-9999px;width:1px;height:1px;";
      bait.innerHTML = "&nbsp;";
      document.body.appendChild(bait);
      // Cosmetic filters apply asynchronously after insertion — give the
      // engine a beat before reading back.
      window.setTimeout(() => {
        const blocked =
          !bait.isConnected ||
          bait.offsetHeight === 0 ||
          window.getComputedStyle(bait).display === "none";
        bait.remove();
        resolve(blocked);
      }, 120);
    } catch {
      resolve(null);
    }
  });
}

async function networkBait(): Promise<boolean | null> {
  const ctrl = new AbortController();
  const timer = window.setTimeout(() => ctrl.abort(), 4000);
  try {
    // no-cors: we can't read the response, but resolving at all means the
    // request reached the network layer unblocked (an opaque response).
    // cache: no-store so a previously cached copy can't mask a blocker
    // installed since.
    await fetch("https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js", {
      mode: "no-cors",
      cache: "no-store",
      signal: ctrl.signal,
    });
    return false;
  } catch {
    // Abort = slow network, not evidence of blocking. Anything else is the
    // extension cancelling the request.
    return ctrl.signal.aborted ? null : true;
  } finally {
    window.clearTimeout(timer);
  }
}
