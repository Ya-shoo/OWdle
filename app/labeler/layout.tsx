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
  // flex-1 (not min-h-screen): the root <body> is a fixed-height flex-col with
  // an mt-auto footer. An explicit min-height here lets flex-shrink clamp this
  // box to one screen while tall content overflows — pinning the footer
  // mid-page over the content. flex-1 (implicit min-height:auto) grows to
  // content, so the footer always lands below it (matches the home main).
  return <div className="dev-ui flex flex-1 flex-col bg-bg">{children}</div>;
}
