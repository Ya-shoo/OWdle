// Content script injected on playowdle.com (and localhost for dev). This is
// the cross-browser handshake: Firefox and Safari have no externally_
// connectable, so instead of the page messaging the extension by id, the
// extension reads the compact snapshot the site writes to localStorage and
// relays it to the background worker.
//
// The site writes localStorage["owdle.reminder"] = JSON string of
// { current, longest, lastCompletedDay, todayDone, day } (see
// components/ExtensionBridge.tsx). We only relay when it actually changes.
(function () {
  var KEY = "owdle.reminder";
  var last = "";

  function relay() {
    var raw;
    try {
      raw = window.localStorage.getItem(KEY);
    } catch (e) {
      return; // storage blocked (private mode etc.)
    }
    if (!raw || raw === last) return;
    last = raw;
    var snap;
    try {
      snap = JSON.parse(raw);
    } catch (e) {
      return;
    }
    if (!snap || typeof snap !== "object") return;
    try {
      chrome.runtime.sendMessage(
        {
          type: "owdle:sync",
          current: snap.current,
          longest: snap.longest,
          lastCompletedDay: snap.lastCompletedDay,
          todayDone: snap.todayDone,
          day: snap.day,
        },
        function () {
          // Swallow "receiving end does not exist" if the SW is asleep.
          void chrome.runtime.lastError;
        },
      );
    } catch (e) {
      // Extension context invalidated (e.g. just updated) — ignore.
    }
  }

  relay();
  // Same-tab writes by the site don't fire a `storage` event, so poll; also
  // react to cross-tab writes and to the tab regaining focus/visibility.
  document.addEventListener("visibilitychange", function () {
    if (document.visibilityState === "visible") relay();
  });
  window.addEventListener("focus", relay);
  window.addEventListener("storage", function (e) {
    if (e.key === KEY) relay();
  });
  setInterval(relay, 5000);
})();
