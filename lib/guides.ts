export type GuideEntry = {
  slug: string;
  label: string;
  // Plain factual description of how the mode works, sourced from the live
  // engine. Deliberately no advice or opinion: any real strategy tips are
  // Yash's to write in his own voice, not invented here.
  intro: string;
};

export const GUIDES: GuideEntry[] = [
  {
    slug: "classic",
    label: "Classic",
    intro:
      "Each guess returns eight tiles: Role, Origin, Affiliation, Species, Gender, Age, Year, and HP. The first five match exactly, green or red. Age, Year, and HP turn amber when a guess is close and show an up or down arrow toward the answer. Eight guesses in total. Two hints can unlock along the way, but each one spends a guess.",
  },
  {
    slug: "quote",
    label: "Quote",
    intro:
      "Two heroes trade lines before a match, and you name both. Getting one right locks that speaker in. Eight guesses across the pair.",
  },
  {
    slug: "ability",
    label: "Ability",
    intro:
      "An ability icon sits behind nine tiles. One is uncovered to start, and each wrong guess uncovers another. You name the hero, not the ability. Eight attempts.",
  },
  {
    slug: "splash",
    label: "Spotlight",
    intro:
      "A crop of hero or skin art zooms out one step with each wrong guess. Five attempts. The pool covers base art and over a thousand skins.",
  },
  {
    slug: "sound",
    label: "Sound",
    intro:
      "A fragment of one of the hero's ability sounds plays, and each wrong guess extends it. Eight attempts.",
  },
];
