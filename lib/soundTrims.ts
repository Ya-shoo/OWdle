// Client-side helper that POSTs a trim edit to the local dev server
// (scripts/sound-trims-server.mjs). The server writes the change to
// data/sound-clip-trims.json, which is imported statically by lib/daily —
// so a browser refresh after a save picks up the new values for the rest
// of the app.
//
// Bundled in the production build alongside the rest of SoundGame, but
// gated behind the DevSoundTrimmer render path which itself only renders
// when NODE_ENV !== "production". Hitting save in prod (e.g. from a
// devtools-injected component) would just fail to connect to localhost
// and surface as a "Save failed" toast — no data leakage.

export type SavedTrim = {
  start: number | null;
  end: number | null;
};

const DEFAULT_ENDPOINT = "http://127.0.0.1:8789/api/sound-trims";

function endpoint(): string {
  // NEXT_PUBLIC_* envs are inlined at build time; this gives a knob in
  // case the dev port collides with something else on the machine.
  const fromEnv = process.env.NEXT_PUBLIC_SOUND_TRIMS_ENDPOINT;
  return fromEnv && fromEnv.length > 0 ? fromEnv : DEFAULT_ENDPOINT;
}

export async function saveSoundClipTrim(
  heroKey: string,
  slug: string,
  trim: SavedTrim,
): Promise<void> {
  let res: Response;
  try {
    res = await fetch(endpoint(), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        heroKey,
        slug,
        startOffset: trim.start,
        endOffset: trim.end,
      }),
    });
  } catch {
    throw new Error(
      "Dev trim server unreachable — run `npm run sound:trims`",
    );
  }
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Save failed (${res.status}) ${text}`.trim());
  }
}
