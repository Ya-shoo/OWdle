// Shared layout for OWdle's local dev hub at /labeler/*. Renders the
// cross-tool nav header above each tool's UI. Dev-only — each child
// page's server component calls notFound() in production so the static
// export emits a 404 for every /labeler/* route.

import { notFound } from "next/navigation";
import { DevHubNav } from "@/components/DevHubNav";

const IS_DEV = process.env.NODE_ENV !== "production";

export default function DevHubLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  if (!IS_DEV) notFound();
  return (
    <div className="min-h-screen bg-bg">
      <DevHubNav />
      {children}
    </div>
  );
}
