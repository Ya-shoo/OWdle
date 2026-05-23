// Shared layout for OWdle's local dev hub at /labeler/*. The hub-index
// at /labeler/page.tsx is the cross-tool directory; this layout just
// applies the dev-only gate so the prod static export emits a 404 for
// every /labeler/* route.
//
// The "← Dev hub" pill that returns you to the hub-index lives in the
// global Header (components/Header.tsx) next to the OWdle brand — it
// only renders on /labeler/* sub-routes via usePathname, so no extra
// wiring is needed here.

import { notFound } from "next/navigation";

const IS_DEV = process.env.NODE_ENV !== "production";

export default function DevHubLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  if (!IS_DEV) notFound();
  return <div className="dev-ui min-h-screen bg-bg">{children}</div>;
}
