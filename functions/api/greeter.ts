// GET /api/greeter
// Serves the current home-page greeter message, sourced from PINNED messages
// in a Discord channel (bot token stays server-side). Edge-cached so we don't
// hammer Discord, with a safe bundled fallback so the site works even before
// Discord is connected.
//
// Authoring convention — in the configured channel:
//   • PIN a message to make it live; unpin to take it down. The clock counts
//     from when you PINNED it, so re-pinning an older message refreshes it.
//   • First line = title (shown bold); the rest = body (plain text).
//   • Optional `duration:` line = how long it shows, counted from the pin
//     time. Units m(in) / h(our) / d(ay) / w(eek), decimals ok — e.g.
//     `duration: 90m`, `duration: 36h`, `duration: 2d`, `duration: 2w`.
//     Omit → 3 days. Expired pins are skipped even if still pinned, so stale
//     notes don't linger.
//   • A pin whose content is exactly `[off]` hides the greeter entirely.
//   • Pins starting with `[greeting]` are evergreen greetings (no expiry);
//     when no patch note is live, one rotates in by day.
// Newest-pinned live patch note wins; else a rotating [greeting]; else fallback.
//
// The bot needs View Channel + Read Message History on the channel AND the
// privileged MESSAGE CONTENT intent enabled (Dev Portal → Bot → Privileged
// Gateway Intents). Without it, Discord returns the message objects but
// strips `content` (and embeds/attachments) from anything the bot didn't
// send / isn't mentioned in — even over REST.

import type { Handler, Env } from "../_lib/types";

type DiscordMessage = {
  id: string;
  content: string;
  timestamp: string; // when the message was posted
  edited_timestamp: string | null;
  // When the message was PINNED. Present on the new /messages/pins endpoint,
  // absent on the legacy /pins fallback. Drives the expiry clock, so
  // re-pinning an old message refreshes it.
  pinned_at?: string;
};

type PollOption = { value: string; label: string };
type Announcement = {
  id: string;
  title: string;
  body: string;
  // poll.id is the BARE message id (no edit-timestamp / day-stamp), so a vote
  // tally survives the author editing the pinned message and doesn't reset
  // daily for [greeting] polls — unlike announcement.id, which is volatile by
  // design (it drives the seen-once-per-edit localStorage tracking).
  poll?: { id: string; options: PollOption[] };
};

const CACHE_TTL_SECONDS = 300; // 5-minute edge cache
const DEFAULT_TTL_MS = 3 * 86400 * 1000; // patch notes default to 3 days
const GREETING_TAG = "[greeting]";
const OFF_TAG = "[off]";
const DISCORD_API = "https://discord.com/api/v10";

// Shown when Discord isn't configured/reachable, or the channel has nothing
// pinned. Keep in sync with FALLBACK_GREETING in lib/greeter.ts (the client's
// own fallback when it can't even reach this endpoint).
const FALLBACK: Announcement = {
  id: "greeter-fallback",
  title: "Hey, welcome! 👋",
  body: "A fresh Overwatch puzzle drops every day. Good luck!",
};

export const onRequestGet: Handler = async ({ request, env, waitUntil }) => {
  const url = new URL(request.url);
  const cacheUrl = new URL(url.origin + url.pathname); // drop query from cache key
  // @ts-expect-error caches.default is a Workers global
  const cache = caches.default as Cache;
  const cacheKey = new Request(cacheUrl.toString(), { method: "GET" });

  const cached = await cache.match(cacheKey);
  if (cached) return cached;

  const announcement = await resolve(env);
  const response = json({ announcement });
  response.headers.set("cache-control", `public, max-age=${CACHE_TTL_SECONDS}`);
  waitUntil(cache.put(cacheKey, response.clone()));
  return response;
};

async function resolve(env: Env): Promise<Announcement | null> {
  const token = env.DISCORD_BOT_TOKEN;
  const channel = env.DISCORD_CHANNEL_ID;
  if (!token || !channel) return FALLBACK;

  const pins = await fetchPins(token, channel);
  if (!pins.length) return FALLBACK;

  const now = Date.now();
  const live: { when: number; a: Announcement }[] = [];
  const greetings: Announcement[] = [];

  for (const m of pins) {
    const content = (m.content || "").trim();
    if (!content) continue;
    if (content.toLowerCase() === OFF_TAG) return null; // global kill-switch

    if (content.toLowerCase().startsWith(GREETING_TAG)) {
      const g = parse(content.slice(GREETING_TAG.length).trim());
      if (!g.title) continue;
      // date-stamped id so a rotating greeting can say hi once per day
      const ga: Announcement = {
        id: `greet:${m.id}:${dayStamp(now)}`,
        title: g.title,
        body: g.body,
      };
      if (g.options.length) ga.poll = { id: `msg:${m.id}`, options: g.options };
      greetings.push(ga);
      continue;
    }

    const p = parse(content);
    if (!p.title) continue;
    // Age is measured from when the message was PINNED, not when it was posted,
    // so re-pinning an older message refreshes its window ("pin to make it
    // live" resets the clock). `pinned_at` comes from the new pins endpoint;
    // the legacy endpoint lacks it, so fall back to post time.
    const liveFrom = Date.parse(m.pinned_at ?? m.timestamp);
    const ttl = p.ttlMs ?? DEFAULT_TTL_MS;
    if (Number.isFinite(liveFrom) && now - liveFrom > ttl) continue; // expired
    const edit = m.edited_timestamp ? `:${Date.parse(m.edited_timestamp)}` : "";
    const a: Announcement = { id: `msg:${m.id}${edit}`, title: p.title, body: p.body };
    if (p.options.length) a.poll = { id: `msg:${m.id}`, options: p.options };
    live.push({ when: Number.isFinite(liveFrom) ? liveFrom : 0, a });
  }

  if (live.length) {
    live.sort((x, y) => y.when - x.when); // newest pinned patch note wins
    return live[0].a;
  }
  if (greetings.length) {
    return greetings[Math.floor(now / 86400000) % greetings.length];
  }
  return FALLBACK;
}

// Reads pinned messages, tolerating both the current endpoint
// (`/messages/pins` → { items: [{ pinned_at, message }] }) and the legacy
// one (`/pins` → message[]). Returns [] on any failure so callers fall back.
async function fetchPins(token: string, channel: string): Promise<DiscordMessage[]> {
  const headers = {
    authorization: `Bot ${token}`,
    "user-agent": "OWdleGreeter (https://playowdle.com, 1.0)",
  };
  try {
    const r = await fetch(`${DISCORD_API}/channels/${channel}/messages/pins?limit=50`, { headers });
    if (r.ok) {
      const data = (await r.json()) as
        | { items?: { pinned_at?: string; message: DiscordMessage }[] }
        | DiscordMessage[];
      if (Array.isArray((data as { items?: unknown[] }).items)) {
        // Carry pinned_at onto the message so resolve() can age from pin time.
        return (data as { items: { pinned_at?: string; message: DiscordMessage }[] }).items
          .filter((it) => it.message)
          .map((it) => ({ ...it.message, pinned_at: it.pinned_at }));
      }
      if (Array.isArray(data)) return data as DiscordMessage[];
    }
  } catch {
    /* fall through to legacy */
  }
  try {
    const r = await fetch(`${DISCORD_API}/channels/${channel}/pins`, { headers });
    if (r.ok) {
      const data = await r.json();
      if (Array.isArray(data)) return data as DiscordMessage[];
    }
  } catch {
    /* give up */
  }
  return [];
}

function parse(content: string): {
  title: string;
  body: string;
  ttlMs: number | null;
  options: PollOption[];
} {
  // Pull out /slash-token poll options (whitespace-bounded so URLs/dates don't
  // trigger it); `_` in a token shows as a space in the label.
  const options: PollOption[] = [];
  const seen = new Set<string>();
  const stripped = content.replace(
    /(^|\s)\/([A-Za-z0-9][\w-]*)/g,
    (_m, pre: string, tok: string) => {
      const key = tok.toLowerCase();
      if (!seen.has(key)) {
        seen.add(key);
        options.push({ value: tok, label: tok.replace(/_/g, " ") });
      }
      return pre; // keep the surrounding whitespace, drop the token
    },
  );

  let ttlMs: number | null = null;
  const kept: string[] = [];
  for (const line of stripped.split("\n")) {
    // `duration: <n><unit>` — units: m(in) / h(our) / d(ay) / w(eek); decimals
    // ok (e.g. `1.5d`, `90m`, `36h`, `2w`). Trailing text after the unit is
    // ignored, so `duration: 2d (until launch)` works. Omit the line entirely
    // to keep the pin live until it's unpinned.
    const dm = line.match(
      /^\s*duration:\s*(\d+(?:\.\d+)?)\s*(m|min|mins|minute|minutes|h|hr|hrs|hour|hours|d|day|days|w|wk|wks|week|weeks)\b.*$/i,
    );
    if (dm) {
      const n = parseFloat(dm[1]);
      const u = dm[2].toLowerCase();
      const perUnitMs = u.startsWith("w")
        ? 7 * 86400000
        : u.startsWith("d")
          ? 86400000
          : u.startsWith("h")
            ? 3600000
            : 60000; // m / min / minute(s)
      ttlMs = Math.max(0, Math.round(n * perUnitMs));
      continue;
    }
    kept.push(line);
  }
  const title = cleanTitle(kept.shift() || "");
  const body = kept.join("\n").replace(/\n{3,}/g, "\n\n").trim();
  return { title, body, ttlMs, options };
}

// First line doubles as the title and is rendered bold client-side, so strip
// any markdown emphasis the author added so the markers don't show literally.
function cleanTitle(s: string): string {
  return s
    .trim()
    .replace(/^#+\s*/, "")
    .replace(/^\*\*(.*)\*\*$/, "$1")
    .replace(/^__(.*)__$/, "$1")
    .trim();
}

function dayStamp(now: number): number {
  return Math.floor(now / 86400000);
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      // public data — allow the dev client on :3000 to read it from the
      // wrangler functions host on :8799.
      "access-control-allow-origin": "*",
    },
  });
}
