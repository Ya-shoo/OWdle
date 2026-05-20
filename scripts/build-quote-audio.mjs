// Pulls Overwatch hero interaction conversations + per-line voice line
// audio from overwatch.fandom.com for use by Quote mode. Each line on the
// wiki has its own audio file (unlike Deadlockle where one MP3 holds the
// whole conversation), so per-line buttons in the UI map 1:1 to wiki
// audio files — no silence detection needed.
//
// Pipeline:
//   1. For each hero in data/heroes.json, fetch <Hero>/Quotes wikitext.
//   2. Slice the `== Interactions ==` section.
//   3. Walk rows; each row has a header (the OTHER hero / heroes), a
//      dialogue cell with `* '''Speaker''': line` entries, and an audio
//      cell with `{{Audio|File.ogg}}<br>` entries in line order.
//   4. Filter to two-speaker rows where both speakers resolve to known
//      hero keys, and the dialogue text doesn't name either speaker
//      (spoiler scrub — same rule conversations.ts uses).
//   5. Dedupe by audio-file fingerprint so a conversation found on both
//      hero pages only goes in once.
//   6. Resolve each `File:Foo.ogg` to its CDN URL via the imageinfo API,
//      download, and transcode to mono 64kbps mp3 (consistent with the
//      Deadlockle pool size strategy).
//   7. Write data/quote-conversations.json — array of
//      { speakers, lines: [{ speaker, text, audio }] }.

import { readFile, writeFile, mkdir, unlink, stat } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { spawn } from "node:child_process";
import ffmpegPath from "ffmpeg-static";

const __dirname = dirname(fileURLToPath(import.meta.url));
const HEROES_IN = resolve(__dirname, "..", "data", "heroes.json");
const OUT_MANIFEST = resolve(__dirname, "..", "data", "quote-conversations.json");
const OUT_DIR = resolve(__dirname, "..", "public", "voicelines", "quote");

const WIKI = "https://overwatch.fandom.com";
const UA = "owdle-quote-audio/0.1 (yashpa0326@gmail.com)";

// Hero display name → wiki page title. Most resolve via name.replace(' ', '_'),
// but a handful need overrides (special characters, redirects, etc).
const PAGE_TITLE_OVERRIDES = {
  "soldier-76": "Soldier:_76",
  "torbjorn": "Torbj%C3%B6rn",
  "lucio": "L%C3%BAcio",
};

// Stopwords that appear in hero display names but aren't unique enough to
// treat as spoiler markers (e.g. "the" in "The Junker Queen" hypothetically).
const NAME_PART_STOPWORDS = new Set([
  "the", "and", "of", "a", "an",
  "lord", "sir", "mr", "mrs", "ms",
]);

async function fetchJson(url) {
  const res = await fetch(url, { headers: { "User-Agent": UA } });
  if (!res.ok) throw new Error(`HTTP ${res.status} on ${url}`);
  return res.json();
}

async function fetchBuffer(url) {
  const res = await fetch(url, { headers: { "User-Agent": UA } });
  if (!res.ok) throw new Error(`HTTP ${res.status} on ${url}`);
  return Buffer.from(await res.arrayBuffer());
}

function pageTitleFor(hero) {
  if (PAGE_TITLE_OVERRIDES[hero.key]) return PAGE_TITLE_OVERRIDES[hero.key];
  return hero.name.replace(/\s+/g, "_");
}

async function getQuotesWikitext(hero) {
  const title = pageTitleFor(hero);
  const url = `${WIKI}/api.php?action=parse&format=json&page=${title}/Quotes&prop=wikitext&redirects=1`;
  try {
    const j = await fetchJson(url);
    return j?.parse?.wikitext?.["*"] ?? "";
  } catch (e) {
    console.log(`  [no Quotes page for ${hero.name}: ${e.message}]`);
    return "";
  }
}

// Slice the `== Interactions ==` H2 from raw wikitext. JS regex doesn't
// support `\Z`, so we find the section start and then locate the next H2
// (`\n==` followed by a non-`=` char) by index.
function extractInteractionsSection(wikitext) {
  const startMatch = wikitext.match(/\n==\s*Interactions\s*==/i);
  if (!startMatch) return "";
  const start = startMatch.index + startMatch[0].length;
  const restRe = /\n==[^=]/g;
  restRe.lastIndex = start;
  const next = restRe.exec(wikitext);
  const end = next ? next.index : wikitext.length;
  return wikitext.slice(start, end);
}

// Strip wiki markup we don't want in the dialogue text. Italics (`''…''`)
// would otherwise leak into the rendered string, and stage directions like
// `*''timid beeps''*` look weird with both wrappers; we keep the sense
// (`*timid beeps*`) but drop the italic markers.
function cleanDialogueText(t) {
  return t
    .replace(/\[\[[^|\]]*\|([^\]]+)\]\]/g, "$1")
    .replace(/\[\[([^\]]+)\]\]/g, "$1")
    .replace(/<[^>]+>/g, "")
    .replace(/\{\{QuoteTranslation\|quote=([^|}]+)\|translation=([^}]+)\}\}/gi, "$2")
    .replace(/\{\{[^}]+\}\}/g, "")
    // Strip italic markers (always exactly two single-quotes for italic;
    // bold uses three but `'''Speaker''':` is consumed before this fn
    // sees the dialogue). Also drop the asterisk wrappers around stage
    // directions so `*''timid beeps''*` cleans to `timid beeps`.
    .replace(/''+/g, "")
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}

// Parse one interaction row's dialogue cell into [{ label, text }, …].
// Wiki convention: each turn is `* '''Speaker''': spoken text`.
function parseTurns(dialogueCell) {
  const turns = [];
  // Split by newline that starts a new bullet — keeps multi-sentence turns intact.
  const lines = dialogueCell.split(/\n\*+\s*/);
  for (const ln of lines) {
    const m = ln.match(/'''([A-Za-zÀ-ÿ][^']{0,40}?)''':\s*([\s\S]*)/);
    if (!m) continue;
    const label = m[1].trim();
    let text = cleanDialogueText(m[2]);
    // Drop trailing parenthetical stage directions like "(laughs)" if they
    // dominate the line — keep them inline otherwise so emoji-style
    // descriptions ("*confused meows*") still read correctly.
    if (text) turns.push({ label, text });
  }
  return turns;
}

// Audio cell looks like: {{Audio|File1.ogg}}<br>{{Audio|File2.ogg}}<br>…
function parseAudioFiles(audioCell) {
  return [...audioCell.matchAll(/\{\{Audio\|([^|}]+\.ogg)\}\}/gi)].map((m) =>
    m[1].trim().replace(/\s+/g, " "),
  );
}

// Walk the Interactions section row by row. Returns an array of raw rows:
// { headerHeroes: string[], dialogueCell: string, audioCell: string }.
//
// Wiki uses table rowspans to group multiple sub-conversations under a
// shared header (the OTHER hero or hero pair). When a row omits the
// header cell, it inherits the most recent one. We also track header
// rowspan budget to skip stray rows.
function parseInteractionRows(section) {
  if (!section) return [];
  const rows = section.split(/\n\|-\s*\n?/);
  const out = [];
  let currentHeroes = null;
  let remaining = 0;

  for (const raw of rows) {
    if (!raw.trim()) continue;

    // Header detection: row starts with a `| rowspan="N" |<center>` block
    // that names one or more `[[Hero]]`s. When present, that's the new
    // shared header for the following N rows.
    const headerRe = /\|\s*rowspan="?(\d+)"?\s*\|\s*<center>(.*?)<\/center>/s;
    const hm = raw.match(headerRe);
    let bodyStart = 0;
    if (hm) {
      const span = parseInt(hm[1], 10);
      const heroes = [...hm[2].matchAll(/\[\[([^\]|]+?)(?:\|[^\]]+)?\]\]/g)]
        .map((m) => m[1].trim())
        .filter((n) => !["File", "Image", "Category"].includes(n.split(":")[0]));
      currentHeroes = heroes;
      remaining = span;
      bodyStart = hm.index + hm[0].length;
    }

    if (remaining <= 0 || !currentHeroes) continue;

    // The remainder of the row is `| <dialogue> | <audio>` (sometimes
    // with extra columns). Split on `\n|` and find the cell containing
    // ''' speaker tags vs the cell containing {{Audio|…}}.
    const body = raw.slice(bodyStart);
    const cells = body.split(/\n\|/);
    let dialogueCell = "";
    let audioCell = "";
    for (const c of cells) {
      if (!dialogueCell && /'''[A-Za-zÀ-ÿ]/.test(c)) dialogueCell = c;
      else if (!audioCell && /\{\{Audio\|/i.test(c)) audioCell = c;
    }
    if (dialogueCell && audioCell) {
      out.push({ headerHeroes: [...currentHeroes], dialogueCell, audioCell });
    }
    remaining--;
  }
  return out;
}

// Build display-name → key lookup for resolving wiki speaker labels.
function buildLabelLookup(heroes) {
  const map = new Map();
  for (const h of heroes) {
    map.set(h.name.toLowerCase(), h.key);
    // Common stripped variant for accented names.
    const stripped = h.name.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase();
    if (stripped !== h.name.toLowerCase()) map.set(stripped, h.key);
  }
  return map;
}

function buildForbiddenTokens(heroes) {
  const banned = new Set();
  for (const h of heroes) {
    banned.add(h.name.toLowerCase());
    for (const part of h.name.split(/\s+/)) {
      const p = part.toLowerCase();
      if (p.length < 4) continue;
      if (NAME_PART_STOPWORDS.has(p)) continue;
      banned.add(p);
    }
  }
  return banned;
}

function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function isSpoilerSafe(text, banned) {
  const lower = text.toLowerCase();
  for (const tok of banned) {
    const isPhrase = tok.includes(" ");
    const re = isPhrase
      ? new RegExp(escapeRe(tok), "i")
      : new RegExp(`\\b${escapeRe(tok)}\\b`, "i");
    if (re.test(lower)) return false;
  }
  return true;
}

async function resolveFileUrl(filename) {
  const title = `File:${filename.replace(/_/g, " ")}`;
  const url = `${WIKI}/api.php?action=query&format=json&prop=imageinfo&iiprop=url&titles=${encodeURIComponent(title)}`;
  const j = await fetchJson(url);
  const pages = j?.query?.pages ?? {};
  for (const k of Object.keys(pages)) {
    const ii = pages[k]?.imageinfo;
    if (ii && ii[0]?.url) return ii[0].url;
  }
  return null;
}

// Mono 64kbps mp3 — same format as Deadlockle's pool. Wiki source is
// .ogg; we transcode primarily to keep formats consistent and shrink size.
function transcodeToMono64kMp3(srcPath, outPath) {
  return new Promise((resolveFn, rejectFn) => {
    const args = [
      "-y",
      "-loglevel", "error",
      "-i", srcPath,
      "-ac", "1",
      "-b:a", "64k",
      "-map_metadata", "-1",
      outPath,
    ];
    const proc = spawn(ffmpegPath, args);
    let stderr = "";
    proc.stderr.on("data", (d) => { stderr += d.toString(); });
    proc.on("error", rejectFn);
    proc.on("exit", (code) => {
      if (code === 0) resolveFn();
      else rejectFn(new Error(`ffmpeg exit ${code}: ${stderr.slice(0, 200)}`));
    });
  });
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true });
  const heroes = JSON.parse(await readFile(HEROES_IN, "utf-8"));
  const labelToKey = buildLabelLookup(heroes);
  const banned = buildForbiddenTokens(heroes);

  // Pass 1: collect raw rows from every hero's Interactions section.
  console.log(`Pass 1: scanning ${heroes.length} heroes for Interactions sections...`);
  const allRows = [];
  for (const h of heroes) {
    const wikitext = await getQuotesWikitext(h);
    if (!wikitext) continue;
    const section = extractInteractionsSection(wikitext);
    if (!section) {
      console.log(`  ${h.key.padEnd(15)} (no Interactions section)`);
      continue;
    }
    const rows = parseInteractionRows(section);
    console.log(`  ${h.key.padEnd(15)} ${rows.length} rows`);
    for (const r of rows) {
      // Track which hero's page we found this on — gives us one of the speakers.
      allRows.push({ ...r, sourceHero: h.key });
    }
    await new Promise((r) => setTimeout(r, 80));
  }

  // Pass 2: parse turns, resolve speakers, dedupe by audio fingerprint.
  console.log(`\nPass 2: parsing ${allRows.length} raw rows...`);
  const seen = new Set();
  const conversations = [];
  let droppedNot2 = 0;
  let droppedSpoiler = 0;
  let droppedLineMismatch = 0;
  let droppedUnknownSpeaker = 0;

  for (const row of allRows) {
    const turns = parseTurns(row.dialogueCell);
    const audioFiles = parseAudioFiles(row.audioCell);

    if (turns.length < 2) continue;
    if (turns.length !== audioFiles.length) {
      droppedLineMismatch++;
      continue;
    }

    // Resolve unique speakers.
    const labels = [...new Set(turns.map((t) => t.label))];
    const keys = labels.map((l) => labelToKey.get(l.toLowerCase()) ?? null);
    if (keys.some((k) => !k)) {
      droppedUnknownSpeaker++;
      continue;
    }
    const uniqueKeys = [...new Set(keys)];
    if (uniqueKeys.length !== 2) {
      droppedNot2++;
      continue;
    }

    const labelToKeyLocal = new Map();
    labels.forEach((l, i) => labelToKeyLocal.set(l, keys[i]));
    const firstKey = labelToKeyLocal.get(turns[0].label);
    const otherKey = uniqueKeys.find((k) => k !== firstKey);
    const speakers = [firstKey, otherKey];

    // Spoiler scrub the joined dialogue.
    const dialogueText = turns.map((t) => t.text).join(" ");
    if (!isSpoilerSafe(dialogueText, banned)) {
      droppedSpoiler++;
      continue;
    }

    // Fingerprint: ordered audio files dedupe cross-page duplicates.
    const fp = audioFiles.join("|");
    if (seen.has(fp)) continue;
    seen.add(fp);

    conversations.push({
      speakers,
      turns: turns.map((t, i) => ({
        speaker: labelToKeyLocal.get(t.label) === speakers[0] ? 0 : 1,
        text: t.text,
        audioFile: audioFiles[i],
      })),
    });
  }

  console.log(
    `  → ${conversations.length} clean conversations (dropped ${droppedUnknownSpeaker} unknown, ${droppedNot2} not-2-speaker, ${droppedLineMismatch} line/audio mismatch, ${droppedSpoiler} spoilers)`,
  );

  // Pass 3: download & transcode each line's audio.
  console.log(`\nPass 3: downloading & transcoding line audio...`);
  const manifest = [];
  for (const c of conversations) {
    const lines = [];
    let allOk = true;
    for (let i = 0; i < c.turns.length; i++) {
      const t = c.turns[i];
      const localName = t.audioFile
        .replace(/[^A-Za-z0-9._-]/g, "_")
        // Collapse runs of dots and trim trailing dots before the
        // extension — Cloudflare R2's API rejects object keys containing
        // `..` (path-traversal guard), so a triple-dot ellipsis or a
        // sentence-ending period in the wiki audio filename would 404
        // on R2 even though it sits fine on Pages. Single dots in the
        // middle (e.g. abbreviations) survive.
        .replace(/\.{2,}/g, "_")
        .replace(/\.+(?=\.[A-Za-z0-9]+$)/, "")
        .toLowerCase()
        .replace(/\.ogg$/, ".mp3");
      const outPath = resolve(OUT_DIR, localName);
      const tmpPath = outPath + ".raw";
      try {
        // Skip download if we already have this file from a previous run.
        let needsDownload = true;
        try {
          const s = await stat(outPath);
          if (s.size > 0) needsDownload = false;
        } catch {}
        if (needsDownload) {
          const url = await resolveFileUrl(t.audioFile);
          if (!url) throw new Error("no URL resolved");
          const buf = await fetchBuffer(url);
          await writeFile(tmpPath, buf);
          await transcodeToMono64kMp3(tmpPath, outPath);
          await unlink(tmpPath).catch(() => {});
        }
        lines.push({
          speaker: t.speaker,
          text: t.text,
          audio: `/voicelines/quote/${localName}`,
        });
        await new Promise((r) => setTimeout(r, 60));
      } catch (e) {
        await unlink(tmpPath).catch(() => {});
        console.log(`    ${t.audioFile}: ${e.message}`);
        allOk = false;
        break;
      }
    }
    if (allOk) {
      manifest.push({ speakers: c.speakers, lines });
    }
  }

  await writeFile(OUT_MANIFEST, JSON.stringify(manifest, null, 2));
  console.log(`\nWrote ${manifest.length} conversations → data/quote-conversations.json`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
