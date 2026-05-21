"use client";

import { useEffect, useState } from "react";

// Embeds the votes-admin helper server's existing dashboard in an
// iframe. The helper runs on http://localhost:8788 (configurable via
// VOTES_ADMIN_PORT in scripts/votes-admin-server.mjs) and serves the
// HTML + proxies the admin API back to the live site using
// ADMIN_SECRET from .env.secrets.
//
// `npm run dev` starts the helper alongside next dev via concurrently,
// so under the normal "spin up the dev server" flow this Just Works.
// If the helper isn't reachable (port collision, secret missing, etc.)
// the iframe shows a clear error state instead of an opaque blank box.

const HELPER_URL = "http://localhost:8788";

export function VotesAdminFrame() {
  const [status, setStatus] = useState<"checking" | "ok" | "down">(
    "checking",
  );

  useEffect(() => {
    let cancelled = false;
    // Quick reachability probe — same-origin fetch from this page can't
    // read the response (cross-origin to :8788), but a network-level
    // failure (helper not listening) shows up as a thrown error vs.
    // the opaque-but-completed promise we get when the helper is up.
    // `no-cors` mode makes the request "simple" so the helper doesn't
    // need to send CORS headers just for our up-check.
    (async () => {
      try {
        await fetch(HELPER_URL, { mode: "no-cors" });
        if (!cancelled) setStatus("ok");
      } catch {
        if (!cancelled) setStatus("down");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (status === "down") {
    return (
      <main className="mx-auto max-w-3xl px-6 py-12">
        <div className="rounded-(--radius-card) border border-warn/40 bg-warn/5 p-6">
          <h2 className="font-mono text-xs uppercase tracking-[0.18em] text-warn">
            Helper server not running
          </h2>
          <p className="mt-3 text-sm text-ink-soft">
            The votes admin needs <code>scripts/votes-admin-server.mjs</code>{" "}
            listening on <code>{HELPER_URL}</code>. The standard{" "}
            <code>npm run dev</code> chains it in alongside Next, so the
            most likely fixes are:
          </p>
          <ul className="mt-4 list-disc space-y-2 pl-6 text-sm text-ink-soft">
            <li>
              You ran <code>npm run dev:next</code> instead of{" "}
              <code>npm run dev</code> — switch to the full one to start
              the helpers.
            </li>
            <li>
              Port <code>8788</code> is busy. Override with{" "}
              <code>VOTES_ADMIN_PORT=…</code> on the helper and update
              the embedded URL below.
            </li>
            <li>
              <code>.env.secrets</code> is missing or has no{" "}
              <code>ADMIN_SECRET</code>. The helper exits on startup if
              it can&apos;t read the secret.
            </li>
          </ul>
          <p className="mt-4 text-xs text-ink-faint">
            Once the helper is up, refresh this page.
          </p>
        </div>
      </main>
    );
  }

  if (status === "checking") {
    return (
      <main className="mx-auto max-w-3xl px-6 py-12">
        <div className="font-mono text-xs uppercase tracking-[0.18em] text-ink-faint">
          Probing helper at {HELPER_URL}…
        </div>
      </main>
    );
  }

  return (
    <iframe
      src={HELPER_URL}
      title="Votes admin"
      className="block h-[calc(100vh-64px)] w-full border-0"
      // Sandbox is intentionally permissive — this is a local-only dev
      // tool we trust, and the helper page needs scripts + same-origin
      // to do its own fetches against its proxy endpoints.
      sandbox="allow-scripts allow-same-origin allow-forms"
    />
  );
}
