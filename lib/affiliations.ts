export const AFFILIATION_REDDIT_URL =
  "https://www.reddit.com/r/Overwatch/comments/1ta97z3/updated_current_affiliation_of_each_overwatch_hero/";

const ALLIANCE_GROUPS: string[][] = [
  ["Overwatch", "Ironclad Guild"],
  ["Talon", "Vishkar Corporation", "Bounty Hunters", "Deadlock Rebels"],
];

export function sameAlliance(a: string, b: string): boolean {
  return ALLIANCE_GROUPS.some(
    (group) => group.includes(a) && group.includes(b),
  );
}
