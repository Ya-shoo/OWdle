// Surface palette selection. Three palettes rotate on a 3-day cycle
// (blue → warm → green); seven holiday palettes auto-activate during
// their date window and take precedence over the rotation.
//
// The inline script in app/layout.tsx runs the same logic in vanilla JS
// before paint so the right data-theme is set without a flash. Keep
// THEME_INLINE_SCRIPT in lock-step with pickTheme() — any holiday
// window change must land in both.

export const ROTATING_THEMES = ["blue", "warm", "green"] as const;
export const HOLIDAY_THEMES = [
  "christmas",
  "newyears",
  "valentines",
  "stpatricks",
  "july4",
  "halloween",
  "thanksgiving",
] as const;
export const ALL_THEMES = [
  ...ROTATING_THEMES,
  ...HOLIDAY_THEMES,
] as const;
export type Theme = (typeof ALL_THEMES)[number];

// Short labels + tooltip copy for the dev switcher. Centralized here so
// adding a holiday is a one-file change.
export const THEME_LABEL: Record<Theme, string> = {
  blue: "B",
  warm: "W",
  green: "G",
  christmas: "Xm",
  newyears: "NY",
  valentines: "Vl",
  stpatricks: "St",
  july4: "J4",
  halloween: "Hw",
  thanksgiving: "Tg",
};

export const THEME_TITLE: Record<Theme, string> = {
  blue: "Blue (rotation)",
  warm: "Warm (rotation)",
  green: "Green (rotation)",
  christmas: "Christmas (Dec 1–25)",
  newyears: "New Year's (Dec 31 – Jan 2)",
  valentines: "Valentine's (Feb 12–14)",
  stpatricks: "St. Patrick's (Mar 14–17)",
  july4: "Independence Day (Jul 1–4)",
  halloween: "Halloween (Oct 17–31)",
  thanksgiving: "Thanksgiving (Nov 22–28)",
};

// Holiday detection. Windows are UTC-anchored so the theme flips at the
// same wall-clock moment globally; the few-hour drift versus a US-local
// calendar doesn't matter for an aesthetic cycle.
export function holidayForDate(d: Date): Theme | null {
  const m = d.getUTCMonth() + 1;
  const day = d.getUTCDate();
  if (m === 12 && day <= 25) return "christmas";
  if ((m === 12 && day === 31) || (m === 1 && day <= 2)) return "newyears";
  if (m === 2 && day >= 12 && day <= 14) return "valentines";
  if (m === 3 && day >= 14 && day <= 17) return "stpatricks";
  if (m === 7 && day >= 1 && day <= 4) return "july4";
  if (m === 10 && day >= 17) return "halloween";
  // US Thanksgiving floats (4th Thursday of November, Nov 22–28). Wide
  // window covers every possible date in the band.
  if (m === 11 && day >= 22 && day <= 28) return "thanksgiving";
  return null;
}

export function pickTheme(d: Date): Theme {
  const holiday = holidayForDate(d);
  if (holiday) return holiday;
  const days = Math.floor(d.getTime() / 86400000);
  const idx =
    ((Math.floor(days / 3) % ROTATING_THEMES.length) +
      ROTATING_THEMES.length) %
    ROTATING_THEMES.length;
  return ROTATING_THEMES[idx];
}

// Vanilla-JS version of pickTheme that ships in every page's HTML.
// Stays in lock-step with the function above. Kept terse because it
// runs synchronously inside <head> before the stylesheet paints.
export const THEME_INLINE_SCRIPT =
  "(function(){" +
  "var n=new Date(),m=n.getUTCMonth()+1,day=n.getUTCDate(),t;" +
  "if(m===12&&day<=25)t='christmas';" +
  "else if((m===12&&day===31)||(m===1&&day<=2))t='newyears';" +
  "else if(m===2&&day>=12&&day<=14)t='valentines';" +
  "else if(m===3&&day>=14&&day<=17)t='stpatricks';" +
  "else if(m===7&&day>=1&&day<=4)t='july4';" +
  "else if(m===10&&day>=17)t='halloween';" +
  "else if(m===11&&day>=22&&day<=28)t='thanksgiving';" +
  "else{var r=['blue','warm','green'],d=Math.floor(Date.now()/86400000);" +
  "t=r[((Math.floor(d/3)%r.length)+r.length)%r.length];}" +
  "document.documentElement.setAttribute('data-theme',t);" +
  "})();";
