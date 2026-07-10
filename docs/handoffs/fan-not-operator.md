# Handoff — Make OWdle read as "fan-made," not "operator-run"

**Status:** in progress · **Owner:** Yash · **Updated:** 2026-07-09
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

- **Demoted the engagement strip below the FAQ** (2026-07-08). `HomeContent.tsx` L188–193: the FAQ now sits directly under the modes grid, so the vote widget + tip jar + sister cards no longer occupy the prime slot right after the modes. Reversible.
  Current homepage order: **Hero → Modes → FAQ → [vote + tip strip] → sister cards → footer.**

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

## Open questions for Yash

1. **Vote widget** — A, B, or C?
2. **Maker note** — are you an OW player, and what's the honest origin story you're comfortable putting on the site?
3. **Monetization** — how far to demote the tip jar / ads vs. keeping revenue visible?

## Definition of done

- A first-time visitor scrolling the homepage meets **game + fan content first**; the roadmap / network / money asks are contained below the fold and don't read as "portfolio operator."
- Homepage passes the gut check: *"would a skeptical r/Overwatch reader call this a content farm?"* → no.
- Validate with the visual audit re-run, and ideally a real OW-fan reaction (friend, or a soft r/Overwatch temperature check) before the next big post.
