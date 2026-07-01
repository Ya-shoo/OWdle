import type { ReactNode } from "react";

// The mascot's announcement now comes from Discord at runtime: SiteGreeter
// fetches /api/greeter (functions/api/greeter.ts reads PINNED messages from a
// Discord channel) and passes the result to AvatarGreeter. To change what the
// site says, pin/edit a message in that channel — no code change or deploy.
//
// This module just holds the shared shape + a client-side fallback, shown
// only if the endpoint itself can't be reached (e.g. local `next dev`, which
// has no Functions runtime, or a transient network error). Keep FALLBACK_
// GREETING in sync with FALLBACK in functions/api/greeter.ts.

export type GreeterAnnouncement = {
  id: string;
  title?: string;
  body: ReactNode;
  poll?: { id?: string; options: { value: string; label: string }[] };
};

export const FALLBACK_GREETING: GreeterAnnouncement = {
  id: "greeter-fallback",
  title: "Hey, welcome! 👋",
  body: "A fresh Overwatch puzzle drops every day — good luck!",
};
