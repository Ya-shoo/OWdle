# Handoff — Make OWdle read as "fan-made," not "operator-run"

**Status:** P0 + P1 + P3 shipped locally — awaiting maker-note copy sign-off, then deploy · **Owner:** Yash · **Updated:** 2026-07-09
**Addresses:** the *"you're showing the backstage, and it reads as operator, not fan"* giveaway from the "does the site feel AI-made?" audit.

---

## Why this matters

A skeptical Overwatch player reads OWdle and gets mixed signals. The **fan** signals are strong (careful modes, human FAQ, source-crediting disclaimer, "hi im yush" voice). But so are the **operator** signals — a vote-for-my-next-game widget, cross-promo to two other quiz sites, a tip jar. Stacked together, those read as *"someone runs a portfolio of quiz sites and monetizes them,"* which primes the **"AI slop / content farm"** reaction — the same energy that got the 2026-05-28 r/Overwatch thread called "AI-coded" and deleted.

This isn't about polish (the site is well-built). It's about **authenticity positioning**. Fixing it directly improves how a relaunch r/Overwatch post lands — that post already "needs hook + fan voice." In a direct-traffic-dominant, authenticity-sensitive genre, fan credibility is what drives community adoption.

## The core idea — pull both levers

1. **Hide the backstage** — demote / reframe / contain the operator signals.
2. **Amplify the fan** — add authenticity signals only a real Overwatch fan would bother to make. Fans smell other fans.

---

## Operator signals on the site today (and where they live)

| # | Signal | Location | Notes |
|---|--------|----------|-------|
| 1 | **"Which game should I work on next?"** vote widget with covers of unrelated games (Minecraft, BG3, Valorant, Genshin, HSR) | `components/RequestNextGame.tsx` (heading L341–344, RAWG search L383, "Current top picks" L512) | **The single loudest signal** — openly frames Overwatch as one interchangeable target in a farm. Backend = D1 votes + RAWG search, **shared/copy-pasted across all three sibling sites**. |
| 2 | **Sister-site cross-promo cards** (Deadlockle + WuWadle) | `components/TryDeadlockleCard.tsx`, `TryWuWadleCard.tsx`; rendered `HomeContent.tsx` L219–222 | "Network of sites" signal. Softer than #1. |
| 3 | **Tip jar** ("Support me :D", Buy me a coffee, Share on X) | `components/SupportLinks.tsx` (L19, L22, L64) | Monetization signal — **but also holds the best existing fan voice** ("hi im yush! I like playing games and building fun things for me & my friends ^_^"). Demote the *ask*, keep the *voice*. |
| 4 | **(Future) AdSense rails** | gated behind `ADSENSE_APPROVED` in `lib/site.ts` | Ads amplify the operator read. Keep density low; Auto ads stay OFF. |
| 5 | **Same template/wordmark across 3 sites** | `components/Brand.tsx` etc. | Really the "it's one template, skinned" giveaway (a separate audit item), but it reinforces the "factory" read. Cross-reference. |

## Already done

- **Demoted the engagement strip below the FAQ** (2026-07-08). `HomeContent.tsx`: the FAQ now sits directly under the modes grid, so the vote widget + tip jar + sister cards no longer occupy the prime slot right after the modes. Reversible.
  Homepage order after this step: **Hero → Modes → FAQ → [vote + tip strip] → sister cards → footer.**

- **Pulled the vote widget off the homepage + surfaced the maker (2026-07-09).** One pass covering P0 + P1 + P3:
  - **P0 — vote widget removed from the homepage.** Yash chose "remove entirely." The "which game next" vote (`RequestNextGame`) now lives on a new opt-in page **`/whats-next`** (`app/whats-next/page.tsx`, uses `modeMetadata` + `ModeBreadcrumbs`, not in the sitemap — matches the `/privacy` precedent). The only homepage entry point is a quiet, centered mono link **"What's next? →"** under the sister-site cards. The `RequestNextGame` component itself is untouched (still cross-site lockstep) — only its *placement* on OWdle diverges. Backend Functions (`/api/vote|search|leaderboard`) unchanged.
  - **P1 — real maker note shipped.** New `components/MakerNote.tsx`, placed right after the modes grid and before the FAQ (shares the FAQ's `max-w-3xl` column). Copy is Yash's real origin story: playing since **Season 9 / Mauga**, dying to ults he couldn't hear (D.Va bomb, RIP-Tire), **Sound was the first mode he built and still his favorite**, made it for himself + friends. The one inline link points "Sound" → `/sound/`. Casual "hi, I'm Yush" voice. **Copy still open to Yash's final tweak.**
  - **P3 — light touch on money/network.** Tip jar kept ("Support me :D") but now a single **centered** `max-w-lg` panel where the 2-col vote+tip strip was. Sister cards kept as-is (light touch).
  - Verified in-browser (homepage + `/whats-next`) and `tsc --noEmit` clean. **NOT deployed.**
  - **New homepage order: Hero → Modes → Maker note → FAQ → Support (centered) → Sister cards + "What's next?" link → footer.**
  - Note: a separate session is prototyping the **P2** "mission-briefing / Overwatch-style mode grid" hero+grid redesign (`owdle-workshop-language.html` mockup). These structural changes are orthogonal to it.

- **Follow-up same day — pulled the maker note + moved the FAQ off the homepage (2026-07-09).** Per Yash ("remove the FAQ section entirely or move it to where the vote games page would be. also for now remove the hi im yush section"):
  - **Maker note removed from the homepage "for now."** `<MakerNote />` is no longer rendered in `HomeContent.tsx` (its import + `HomeFaq` import dropped), but `components/MakerNote.tsx` is **kept intact** for an easy re-add.
  - **FAQ relocated homepage → `/whats-next`.** `<HomeFaq />` now renders on `/whats-next` **below** the vote widget, and its **FAQPage JSON-LD moved with it** — out of `app/page.tsx`'s `@graph` (its `HOME_FAQ` import dropped), into a new `@graph` on `app/whats-next/page.tsx` alongside a BreadcrumbList — so schema and visible copy stay together (Google requirement). Homepage `@graph` no longer has a FAQPage node.
  - **Current homepage order: Hero → Modes → Support (centered) → Sister cards + "What's next?" link → footer.** No maker note, no FAQ — that below-the-fold space is now free for the P2 redesign.
  - **SEO note:** the homepage loses its visible keyword-rich FAQ text + FAQPage schema; both now live on the low-traffic, non-sitemap `/whats-next`. FAQ rich results are largely deprecated so the SERP hit is small, but if homepage topical coverage matters, `/how-to-play` is a more natural home than `/whats-next`. Fully reversible.
  - Re-verified in-browser (both pages) + `tsc --noEmit` clean. The 2 eslint errors in `HomeContent.tsx` (`set-state-in-effect` L63, `no-unescaped-entities` L409) are **pre-existing**, not from this work.

---

## The plan (prioritized)

### P0 — Reframe or contain the vote widget *(biggest single win)*
Stop advertising Overwatch as one farm target among many. Pick one:

- **(A) Reframe "next game" → "next mode / feature for OWdle."** Removes the cross-game optics entirely, keeps the engagement. **Cost:** diverges from the shared RAWG/D1 widget — must either be redone on all three sites or accepted as an intentional per-site divergence. Biggest rethink.
- **(B) Keep "next game" but hide the unrelated-game covers** behind a "Suggest a game →" disclosure, so Minecraft/Valorant aren't on-screen by default. Low code, preserves the backend, kills most of the optics. **← recommended default.**
- **(C) Remove it from the homepage** (move to a footer link or `/about`). Cleanest optics, loses the roadmap-engagement feature.

Files: `components/RequestNextGame.tsx`, placement in `HomeContent.tsx` L204–213.
**Decision needed from Yash.** Default if unspecified: **(B)**.

### P1 — Add a genuine "from the maker" note *(highest authenticity per unit effort)*
A short, real-voice note: who you are as an Overwatch player and why you built OWdle. This is the heart of "reads as fan."
- **Do NOT invent personal facts.** Yash supplies the real content (or approves a drafted skeleton). Need from Yash: are you an OW player? since when / main / role? the honest origin story.
- Placement candidates: an "About / from the maker" block near the About/FAQ, or restructure `SupportLinks` so the fan note leads and the tip ask follows.
- Casual voice like the existing "hi im yush" line is exactly right. Keep em dashes sparse.

### P2 — Weave Overwatch fan texture below the fold
Below the hero banner the page is currently theme-neutral (could be any game). Add things only a fan includes:
- Role iconography (tank / damage / support) as section furniture or mode metadata.
- Hero portraits / references in the modes grid.
- Small in-jokes / community nods in microcopy.

**Do this together with the "Overwatch-style mode grid" redesign** (from the same audit) — it's the same below-the-fold surface, one design pass.

### P3 — Soften the remaining network / money signals
- Sister-site cards: already demoted; consider an even lighter "also made by me" footer treatment instead of full cards.
- Tip jar: keep the voice, reduce the ask's prominence (lead with the P1 fan note, tip second).
- Ads (future): minimal density only.

---

## Constraints & gotchas

- **Cross-site lockstep:** the vote widget + D1 + RAWG search are copy-pasted across OWdle / Deadlockle / WuWadle. Any reframe either lands in all three or is a deliberate per-site divergence — grep both sibling repos before calling it done.
- **No fabricated personal facts** for the maker note — Yash provides them.
- **Solid surfaces only** for any new panels: no low-opacity fills; use the solid `bg-tint-*` / `border-line-*` tokens; `text-wrong` is a fill (use `text-on-wrong`).
- **Deploy only on explicit "deploy."** Everything here ships local-first; wait for the word.
- **Copy conventions:** "Guess the [Overwatch] hero" (Quote keeps "Identify both speakers"); em dashes + stray hyphens sparse.

## Open questions for Yash — RESOLVED 2026-07-09

1. ~~**Vote widget** — A, B, or C?~~ → **Removed from homepage entirely** → new `/whats-next` page, quiet link under the sister cards.
2. ~~**Maker note** — OW player? origin story?~~ → **Yes.** Real story supplied (Season 9/Mauga, sound-driven, Sound-mode origin) and shipped in `MakerNote.tsx`. Final copy tweak still welcome.
3. ~~**Monetization** — how far to demote?~~ → **Light touch.** Tip jar centered but kept; sister cards unchanged.

Still open:
- **Maker-note copy sign-off** — read `MakerNote.tsx` and adjust wording/voice if wanted.
- **P2 fan texture / Overwatch-style mode grid** — the Workshop language's **Phase 1 is BUILT locally (2026-07-12)** in this same working tree: Saira Condensed display promotion, `Plate` chips (hero date/NEXT + card win/miss states), payload-run header tracker (replaces the five dots), gold-at-3 streak flame, borderless home cards, mono-eyebrow retirement across user-facing chrome. Yash's scope cuts: NO hazard stripes, chamfer stays game-tile-only, no card outlines, wordmark hero kept. Victory/Defeat splash wording still undecided (Phase 3). See `project_owdle_design_language` memory + the Workshop artifact.
- **Deploy** — everything is local-first; ship on Yash's explicit "deploy."

## Definition of done

- A first-time visitor scrolling the homepage meets **game + fan content first**; the roadmap / network / money asks are contained below the fold and don't read as "portfolio operator."
- Homepage passes the gut check: *"would a skeptical r/Overwatch reader call this a content farm?"* → no.
- Validate with the visual audit re-run, and ideally a real OW-fan reaction (friend, or a soft r/Overwatch temperature check) before the next big post.
