// Pacific "puzzle day" helpers, ported verbatim from the OWdle web app so the
// extension agrees with the site about which day it is. The daily rolls over
// at 2:15am America/Los_Angeles, so the hours between Pacific midnight and
// 2:15am still belong to the previous puzzle day.
//
// Mirrors lib/daily.ts `dayString()` and lib/streak.ts `prevDay()`. Loaded in
// the service worker via importScripts() and in popup.html via a <script> tag,
// so it attaches to the global (self/window) rather than using modules.
(function (root) {
  var RESET_HOUR_PT = 2;
  var RESET_MIN_PT = 15;
  var RESET_TZ = "America/Los_Angeles";

  // YYYY-MM-DD Pacific puzzle day for a given Date (default: now).
  function owdleDayString(d) {
    d = d || new Date();
    var parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: RESET_TZ,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).formatToParts(d);
    function get(type) {
      var p = parts.find(function (x) {
        return x.type === type;
      });
      return p ? p.value : "0";
    }
    var y = parseInt(get("year"), 10);
    var mo = parseInt(get("month"), 10);
    var da = parseInt(get("day"), 10);
    var h = parseInt(get("hour"), 10);
    var mi = parseInt(get("minute"), 10);
    var beforeReset =
      h < RESET_HOUR_PT || (h === RESET_HOUR_PT && mi < RESET_MIN_PT);
    var shift = beforeReset ? -1 : 0;
    return new Date(Date.UTC(y, mo - 1, da + shift)).toISOString().slice(0, 10);
  }

  // The puzzle day before `day` (YYYY-MM-DD -> YYYY-MM-DD).
  function owdlePrevDay(day) {
    var a = day.split("-").map(Number);
    var date = new Date(Date.UTC(a[0], a[1] - 1, a[2]));
    date.setUTCDate(date.getUTCDate() - 1);
    return date.toISOString().slice(0, 10);
  }

  root.owdleDayString = owdleDayString;
  root.owdlePrevDay = owdlePrevDay;
})(typeof self !== "undefined" ? self : this);
