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
