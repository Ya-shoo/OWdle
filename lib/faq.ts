// Home-page FAQ content. Consumed in two places that MUST stay in sync:
//   1. components/HomeFaq.tsx renders it as a visible, collapsible <details>
//      list. The answer copy is in the DOM even when a row is collapsed, so
//      it's crawlable indexable text — the whole point of the section.
//   2. app/page.tsx emits it as FAQPage JSON-LD in the home page's @graph.
// Keeping one source means the visible copy and the structured data can
// never drift. Answers are plain text (no markup) so the same strings drop
// cleanly into both the rendered DOM and the JSON-LD payload. Copy is kept
// casual/conversational on purpose — no em dashes.
export type FaqItem = { q: string; a: string };

export const HOME_FAQ: FaqItem[] = [
  {
    q: "What is OWdle?",
    a: "OWdle is a free daily Overwatch guessing game, basically Wordle but for Overwatch heroes. There's a new hero to figure out every day, and everyone gets the same one that day so you can compare with friends.",
  },
  {
    q: "How do you play OWdle?",
    a: "You just type in an Overwatch hero and OWdle tells you how close you are. Every mode gives you a different kind of clue (attribute tiles, an ability icon, an ability sound, a bit of splash art) and you keep guessing till you land on the right hero.",
  },
  {
    q: "What game modes does OWdle have?",
    a: "There's five modes every day. Classic gives you eight attribute tiles to narrow things down, Ability shows an ability icon that slowly reveals itself, Quote drops you into a convo between two heroes and you name both, Sound plays a short ability sound, and Spotlight shows a cropped bit of splash art that zooms out every time you miss.",
  },
  {
    q: "When does a new OWdle puzzle come out?",
    a: "A new puzzle goes up every day at 2:15am Pacific. Each mode has its own hero for the day and it stays the same for everybody until the next reset.",
  },
];

// Melee bonus-mode FAQ. Same dual-use contract as HOME_FAQ: HomeFaq
// renders it visibly on /melee/ (so the copy is crawlable and satisfies
// Google's "FAQ must be visible" rule) while app/melee/page.tsx emits the
// matching FAQPage JSON-LD from the same source. Copy targets the long-tail
// query "guess that overwatch hero's melee sound"; casual, no em dashes.
export const MELEE_FAQ: FaqItem[] = [
  {
    q: "What is the Overwatch melee sound quiz?",
    a: "It's a daily bonus round on OWdle where you hear one Overwatch hero's melee swing and have to guess who it is. You get five tries, and the full source clip plays back once you solve it or run out.",
  },
  {
    q: "How do you play Melee mode?",
    a: "Hit play to hear the melee sound, type in the hero you think it belongs to, and you have five guesses. Every hero sounds a little different when they swing, so listen for the weight and pitch of the hit. Each guess also shows that hero's role, and it turns green when the role matches the day's hero, so a miss still helps you narrow things down.",
  },
  {
    q: "Is Melee part of the daily OWdle?",
    a: "Melee is a bonus mode, so it sits outside the five daily modes and doesn't count toward your streak or rank. It's just an extra round to play, with a fresh hero every day.",
  },
  {
    q: "Does the melee sound quiz have a new hero every day?",
    a: "Yep. A new hero's melee sound goes up every day at 2:15am Pacific, the same reset as the daily OWdle puzzles, and everyone gets the same one that day.",
  },
];

// Per-mode FAQs. Same dual-use contract as HOME_FAQ and MELEE_FAQ: HomeFaq
// renders each one visibly below the game on its mode page, and the page
// emits matching FAQPage JSON-LD from the SAME array so visible copy and
// structured data can't drift.
//
// These deliberately do NOT repeat HOME_FAQ's questions (what is OWdle, how
// do you play, what modes are there, when does it reset). Five pages
// restating the same four answers would be its own duplicate-content
// problem. Everything here is specific to the one mode.
//
// COPY OWNERSHIP: these answers are Yash's own words, transcribed from
// dictation. Edits are limited to removing spoken artifacts (false starts,
// "number two", comma splices). Do NOT paraphrase, tighten, or add to them.
// If an answer reads awkwardly or turns out to be factually wrong, ASK Yash
// what he'd write instead rather than rewriting it yourself. Plain text, no
// markup, no em dashes, so the strings drop cleanly into DOM and JSON-LD.

export const CLASSIC_FAQ: FaqItem[] = [
  {
    q: "How do you play Classic mode on OWdle?",
    a: "Just start by guessing. Each guess will progressively reveal more information about the correct hero. The attribute tiles are color-coded Wordle style so that you can tell whether or not you're getting closer or further away.",
  },
  {
    q: "What do the eight attribute tiles mean?",
    a: "Each attribute tile is a component that makes up the Overwatch hero. For example, Winston: his gender, his species, his region of origin, his role. They provide more information than you think.",
  },
  {
    q: "What do the green, amber, and red tiles mean?",
    a: "Green means it's correct. Amber means you're close, and red or gray means it's a miss.",
  },
  {
    q: "What do the arrows on the Age, Year, and HP tiles mean?",
    a: "The arrows indicate, if you are close or incorrect, in which direction. The arrows point in the direction that the answer lies.",
  },
  {
    // Yash delegated this one ("you can fill that out, super concise") and
    // approved this wording on 2026-07-27. The numbers come from
    // ClassicBoard.tsx:27-44 — MAX_GUESSES is a hard cap on guesses AND hints
    // combined, so a hint spends a guess.
    q: "How many guesses and hints do you get in Classic?",
    a: "You get eight guesses. Two hints can unlock along the way, but taking a hint spends one of your eight.",
  },
];

export const QUOTE_FAQ: FaqItem[] = [
  {
    // Yash's dictated answer originally ended "and if you're really
    // struggling, you can use a hint." Quote has no hint button — the voice
    // clips unlock automatically at guess 5 and guess 7 (QuoteGame.tsx:10-13).
    // He confirmed dropping the clause rather than replacing it. Leave it out.
    q: "How do you play Quote mode?",
    a: "Similar to the other modes, you can begin by guessing a hero. But the goal of Quote mode is to guess which two heroes are having the pre-match conversation. Similar to Classic mode, you can use the color tiles to glean the answer or get closer.",
  },
  {
    q: "Why are there two heroes to guess instead of one?",
    a: "Most of the interactions in Overwatch involve two heroes.",
  },
  {
    q: "What happens when you get one of the two speakers right?",
    a: "When you get a speaker right, their box automatically becomes green and complete, and you automatically begin guessing for the other hero in that conversation.",
  },
  {
    q: "Where do the quotes come from?",
    a: "The quotes are from real in-game conversations that happen before a match begins between heroes on the same team.",
  },
];

export const ABILITY_FAQ: FaqItem[] = [
  {
    q: "How do you play Ability mode?",
    a: "Similar to the other modes you're guessing for the Overwatch hero, but this time you are guessing based off a hero's ability icon. You are still trying to guess which Overwatch hero that ability belongs to.",
  },
  {
    q: "Do you guess the ability or the hero it belongs to?",
    a: "You guess the hero that that ability belongs to.",
  },
  {
    q: "How does the hidden icon get revealed?",
    a: "The hidden icon gradually gets revealed as you continue guessing. The specific tiles are chosen at random.",
  },
  {
    q: "Why is Ability the hardest mode?",
    a: "It's hard memorizing every ability icon for all Overwatch heroes. The way in which the full ability icon is revealed takes a lot of time, so there's pressure that builds up.",
  },
];

export const SPLASH_FAQ: FaqItem[] = [
  {
    q: "How do you play Spotlight mode?",
    a: "Similar to the other modes, you're guessing an Overwatch hero, but this time you're guessing them based off their in-game splash art for their skin.",
  },
  {
    q: "Does Spotlight use hero skins or just base art?",
    a: "Strong preference for skins only, unless the character only has one or two legendary skins, then their base art is included.",
  },
  {
    q: "How does the zoom out work?",
    a: "We pick the point of origin for the zoom at random, and as you guess the zoom exponentially zooms out.",
  },
  {
    q: "Why do you only get five guesses in Spotlight?",
    a: "To keep it challenging :p",
  },
];

export const SOUND_FAQ: FaqItem[] = [
  {
    q: "How do you play Sound mode?",
    a: "You guess the Overwatch hero by their ability sound effect.",
  },
  {
    q: "How long is the audio clip you get?",
    a: "That depends on how long the original recording was. This is a case judgment made by myself for whether or not you have enough information to guess.",
  },
  {
    q: "Where do the audio bites come from?",
    a: "I recorded them myself. This was a mode I really wanted for myself as a beginner player, and I'm glad I got to make it and share it with everyone :D",
  },
];
