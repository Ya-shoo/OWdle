// Shared layout for OWdle's local dev hub at /labeler/*. The hub-index
// at /labeler/page.tsx is the cross-tool directory; this layout just
// applies the dev-only gate so the prod static export emits a 404 for
// every /labeler/* route.
//
// Why no top nav: the hub-index page IS the directory. Sub-tool pages
// can be opened in their own browser tabs from the hub, so an
// additional top nav would be redundant.

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
