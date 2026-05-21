"use client";

import { useEffect, useState } from "react";

// Embeds the feedback-admin helper server's dashboard in an iframe. The
// helper runs on http://localhost:8790 (configurable via
// FEEDBACK_ADMIN_PORT in scripts/feedback-admin-server.mjs) and serves
// the HTML + proxies /api/feedback-raw back to the live site using
// ADMIN_SECRET from .env.secrets.
//
// `npm run dev` starts the helper alongside next dev via concurrently,
// so under the normal "spin up the dev server" flow this Just Works.
// Mirrors VotesAdminFrame's reachability probe so port collisions or a
// missing secret render a clear inline error instead of a blank iframe.

const HELPER_URL = "http://localhost:8790";

export function FeedbackAdminFrame() {
  const [status, setStatus] = useState<"checking" | "ok" | "down">(
    "checking",
  );

  useEffect(() => {
    let cancelled = false;
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
            The feedback admin needs{" "}
            <code>scripts/feedback-admin-server.mjs</code> listening on{" "}
            <code>{HELPER_URL}</code>. The standard <code>npm run dev</code>{" "}
            chains it in alongside Next, so the most likely fixes are:
          </p>
          <ul className="mt-4 list-disc space-y-2 pl-6 text-sm text-ink-soft">
            <li>
              You ran <code>npm run dev:next</code> instead of{" "}
              <code>npm run dev</code> — switch to the full one to start
              the helpers.
            </li>
            <li>
              Port <code>8790</code> is busy. Override with{" "}
              <code>FEEDBACK_ADMIN_PORT=…</code> on the helper and update
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
      title="Feedback admin"
      className="block h-[calc(100vh-64px)] w-full border-0"
      sandbox="allow-scripts allow-same-origin allow-forms"
    />
  );
}
