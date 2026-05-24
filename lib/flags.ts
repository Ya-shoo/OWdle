// Maps a Hero `country` value to its SVG flag filename in /public/flags/.
// Entries omitted from this map fall back to spelled-out text — currently
// just "Lunar Colony", which has no canonical flag in Overwatch lore.
//
// "Numbani" uses the canonical OW flag (Wikimedia Commons public domain).
// "Mars" uses the Zubrin tricolor "Flag of Mars" (Wikipedia public domain).
// "Scotland" uses the Saltire (subdivision flag, not GB).
const FLAG_FILE_BY_COUNTRY: Record<string, string> = {
  Australia: "au",
  Brazil: "br",
  Canada: "ca",
  China: "cn",
  Denmark: "dk",
  Egypt: "eg",
  France: "fr",
  Germany: "de",
  Haiti: "ht",
  India: "in",
  Ireland: "ie",
  Italy: "it",
  Japan: "jp",
  Mars: "mars",
  Mexico: "mx",
  Nepal: "np",
  Netherlands: "nl",
  Nigeria: "ng",
  Numbani: "numbani",
  Peru: "pe",
  Russia: "ru",
  Samoa: "ws",
  Scotland: "gb-sct",
  "South Korea": "kr",
  Sweden: "se",
  Switzerland: "ch",
  Thailand: "th",
  Turkey: "tr",
  USA: "us",
  "United Kingdom": "gb",
};

export function getFlagSrc(country: string | null | undefined): string | null {
  if (!country) return null;
  const code = FLAG_FILE_BY_COUNTRY[country];
  return code ? `/flags/${code}.svg` : null;
}
