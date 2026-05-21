import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { VotesAdminFrame } from "@/components/VotesAdminFrame";

// Embeds the local votes admin viewer (scripts/votes-admin-server.mjs on
// :8788) so it lives inside the dev hub. The helper server reads
// ADMIN_SECRET from .env.secrets and proxies to playowdle.com/api/votes
// so the secret never leaves the dev machine. `npm run dev` chains the
// helper in via concurrently, so this page works as soon as you've
// started the dev server. When .env.secrets isn't present, the helper
// still starts but serves a "viewer offline · set ADMIN_SECRET" stub.

const IS_DEV = process.env.NODE_ENV !== "production";

export const metadata: Metadata = IS_DEV
  ? {
      title: "Votes admin — OWdle dev hub",
      robots: { index: false, follow: false },
    }
  : {};

export default function VotesAdminPage() {
  if (!IS_DEV) notFound();
  return <VotesAdminFrame />;
}
