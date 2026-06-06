// Fire-and-forget server-side PostHog capture for Pages Functions.
//
// The browser SDK never sees link unfurlers (Discord, iMessage, Slack…)
// because they fetch /r/[code] without running JS — so the middle of
// the share funnel (copied → PASTED somewhere → visited) is only
// observable server-side. Events POST directly to us.i.posthog.com;
// the /ingest reverse proxy exists to dodge browser ad-blockers, which
// aren't a thing inside a Cloudflare isolate.
//
// The key is the same public phc_ client key the browser bundle ships
// (it's in every page load by design). Pages Functions can't read
// .env.local — that's a Next build-time file — and a dashboard env var
// is needless ceremony for a non-secret, so it lives here as a const.

const POSTHOG_ENDPOINT = "https://us.i.posthog.com/i/v0/e/";
const POSTHOG_PUBLIC_KEY = "phc_AE5pvD5WozNPsftsUMBMKwaCWcjHhLjTVfdyRowmP7A5";

// Capture a single server-side event. Pass the Pages context's
// waitUntil so the POST survives the response being returned; the
// request itself never blocks or fails the page — analytics must not
// break unfurls.
export function captureServerEvent(opts: {
  event: string;
  properties: Record<string, unknown>;
  waitUntil?: (p: Promise<unknown>) => void;
}): void {
  const send = fetch(POSTHOG_ENDPOINT, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      api_key: POSTHOG_PUBLIC_KEY,
      event: opts.event,
      // Anonymous one-off: a random distinct_id per event plus
      // $process_person_profile:false keeps server events out of the
      // person-profile quota entirely — the server-side mirror of the
      // client's person_profiles: "identified_only".
      distinct_id: crypto.randomUUID(),
      properties: {
        ...opts.properties,
        // The client registers site as a super-prop; server events
        // must carry it explicitly or they vanish from every
        // site=owdle-filtered dashboard.
        site: "owdle",
        $process_person_profile: false,
        $lib: "owdle-pages-fn",
      },
    }),
  }).catch(() => {
    // Swallow: a dropped analytics beacon is strictly better than a
    // failed share unfurl.
  });
  opts.waitUntil?.(send);
}
