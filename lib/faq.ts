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
    a: "You just type in an Overwatch hero and OWdle tells you how close you are. Every mode gives you a different kind of clue (attribute tiles, an ability icon, a voice line, a bit of splash art) and you keep guessing till you land on the right hero.",
  },
  {
    q: "What game modes does OWdle have?",
    a: "There's five modes every day. Classic gives you eight attribute tiles to narrow things down, Ability shows an ability icon that slowly reveals itself, Quote drops you into a convo between two heroes and you name both, Sound plays a short voice line, and Spotlight shows a cropped bit of splash art that zooms out every time you miss.",
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
    a: "It's a daily bonus round on OWdle where you hear one Overwatch hero's melee swing and have to guess who it is. You get three tries, and the full source clip plays back once you solve it or run out.",
  },
  {
    q: "How do you play Melee mode?",
    a: "Hit play to hear the melee sound, type in the hero you think it belongs to, and you have three guesses. Every hero sounds a little different when they swing, so listen for the weight and pitch of the hit.",
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
