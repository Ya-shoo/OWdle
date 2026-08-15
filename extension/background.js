// OWdle Daily Reminder — background service worker (Manifest V3).
//
// Sends at most ONE notification per day, at the user's chosen local hour:
//   1. Streak at risk  — you have a live streak and haven't finished today.
//   2. Live reminder   — today's OWdle is up and you haven't played.
//   3. Feedback ask     — rare, only on a day you already played.
//
// It knows your streak/last-played day from a handshake the OWdle site pushes
// via chrome.runtime.sendMessage (externally_connectable). Until the site has
// pushed once, it falls back to a soft generic "it's live" reminder.

// Chrome/Safari run this as a service worker (importScripts available).
// Firefox runs it as an event page and loads daytime.js via the manifest's
// background.scripts array instead, where importScripts doesn't exist.
if (typeof importScripts === "function") importScripts("daytime.js");

const OWDLE_URL = "https://playowdle.com/";
const ALARM = "owdle-daily";

// One notification id per kind so a new one replaces the last unread one
// rather than stacking. onClicked maps each back to a destination.
const NOTIF = {
  streak: "owdle-streak",
  live: "owdle-live",
  feedback: "owdle-feedback",
};
const NOTIF_URL = {
  [NOTIF.streak]: OWDLE_URL,
  [NOTIF.live]: OWDLE_URL,
  [NOTIF.feedback]: OWDLE_URL + "?feedback=1",
};

const DEFAULTS = {
  enabled: true, // master switch
  hour: 17, // local hour (0-23) to fire the daily check
  streakOnly: false, // only ping when a streak is actually at risk
  feedbackAsks: true, // occasionally ask what to add
};

// Ask for feedback at most this often, and never in the first few days.
const FEEDBACK_INTERVAL_MS = 21 * 24 * 60 * 60 * 1000;
const FEEDBACK_MIN_AGE_MS = 5 * 24 * 60 * 60 * 1000;

// ── storage helpers ────────────────────────────────────────────────────────

async function getSettings() {
  const { settings } = await chrome.storage.local.get("settings");
  return Object.assign({}, DEFAULTS, settings || {});
}

async function getSync() {
  const { sync } = await chrome.storage.local.get("sync");
  return sync || null;
}

// ── scheduling ─────────────────────────────────────────────────────────────

// Next occurrence of the configured local hour. setHours works in the
// browser's local zone, so this tracks the user's wall clock across DST.
function nextFireTime(hour) {
  const now = new Date();
  const next = new Date(now);
  next.setHours(hour, 0, 0, 0);
  if (next.getTime() <= now.getTime()) next.setDate(next.getDate() + 1);
  return next.getTime();
}

async function scheduleNext() {
  const { hour } = await getSettings();
  await chrome.alarms.clear(ALARM);
  chrome.alarms.create(ALARM, { when: nextFireTime(hour) });
}

// ── decide + notify ────────────────────────────────────────────────────────

function notify(id, title, message) {
  chrome.notifications.create(id, {
    type: "basic",
    iconUrl: chrome.runtime.getURL("icons/icon128.png"),
    title,
    message,
    priority: 1,
    requireInteraction: false,
  });
}

async function feedbackDue() {
  const { lastFeedbackAt, installedAt } = await chrome.storage.local.get([
    "lastFeedbackAt",
    "installedAt",
  ]);
  const now = Date.now();
  if (installedAt && now - installedAt < FEEDBACK_MIN_AGE_MS) return false;
  const base = lastFeedbackAt || installedAt || 0;
  return now - base >= FEEDBACK_INTERVAL_MS;
}

// The core once-a-day decision. Fired by the alarm.
async function evaluate() {
  const s = await getSettings();
  if (!s.enabled) return;

  const today = owdleDayString();

  // Honor "one per day" even if the SW gets woken twice.
  const { lastNotifyDay } = await chrome.storage.local.get("lastNotifyDay");
  if (lastNotifyDay === today) return;

  const sync = await getSync();
  let playedToday = false;
  let streakAtRisk = false;
  let current = 0;

  if (sync) {
    current = Number(sync.current) || 0;
    const last = sync.lastCompletedDay;
    // Completed the whole daily today?  Prefer the freshest signal we have:
    // lastCompletedDay flips to today only when every mode is done.
    playedToday =
      last === today || (sync.day === today && sync.todayDone === true);
    // Streak lives only if yesterday was completed and today isn't yet.
    streakAtRisk = !playedToday && current > 0 && last === owdlePrevDay(today);
  }

  const mark = () => chrome.storage.local.set({ lastNotifyDay: today });

  if (playedToday) {
    // Good moment to ask — they've already engaged today.
    if (s.feedbackAsks && (await feedbackDue())) {
      notify(
        NOTIF.feedback,
        "Anything you'd want added to OWdle?",
        "Tap to send a quick note. It goes straight to the maker.",
      );
      await chrome.storage.local.set({ lastFeedbackAt: Date.now() });
      mark();
    }
    return;
  }

  // Haven't finished today's daily.
  if (streakAtRisk) {
    notify(
      NOTIF.streak,
      "Your " + current + "-day streak ends tonight",
      "Finish today's OWdle before the 2:15am reset to keep it going.",
    );
    mark();
    return;
  }

  // No live streak to protect. Respect the streak-only preference.
  if (s.streakOnly) return;

  notify(
    NOTIF.live,
    "Today's OWdle is live",
    "A fresh Overwatch hero is waiting. Take your guess.",
  );
  mark();
}

// If Chrome was closed at the reminder hour the alarm never fired, so a
// streak-save nudge could be missed. On startup, if we're already past
// today's window and haven't notified yet, run the check now. evaluate()
// still enforces the one-per-day cap.
async function maybeCatchUp() {
  const { hour } = await getSettings();
  if (new Date().getHours() < hour) return; // window hasn't arrived yet today
  const today = owdleDayString();
  const { lastNotifyDay } = await chrome.storage.local.get("lastNotifyDay");
  if (lastNotifyDay === today) return;
  await evaluate();
}

// ── event wiring (top level so the SW re-registers them on wake) ────────────

chrome.runtime.onInstalled.addListener(async () => {
  const { installedAt } = await chrome.storage.local.get("installedAt");
  if (!installedAt) await chrome.storage.local.set({ installedAt: Date.now() });
  await scheduleNext();
});

chrome.runtime.onStartup.addListener(async () => {
  await scheduleNext();
  await maybeCatchUp();
});

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name !== ALARM) return;
  try {
    await evaluate();
  } finally {
    await scheduleNext();
  }
});

chrome.notifications.onClicked.addListener((id) => {
  const url = NOTIF_URL[id] || OWDLE_URL;
  chrome.tabs.create({ url });
  chrome.notifications.clear(id);
});

// Store the streak snapshot relayed by the content script on playowdle.com.
function storeSync(msg) {
  const sync = {
    current: Number(msg.current) || 0,
    longest: Number(msg.longest) || 0,
    lastCompletedDay:
      typeof msg.lastCompletedDay === "string" ? msg.lastCompletedDay : null,
    todayDone: msg.todayDone === true,
    day: typeof msg.day === "string" ? msg.day : null,
    at: Date.now(),
  };
  chrome.storage.local.get("installedAt").then(({ installedAt }) => {
    const patch = { sync };
    if (!installedAt) patch.installedAt = Date.now();
    chrome.storage.local.set(patch);
  });
}

// One listener for both the content-script handshake (owdle:sync) and the
// popup controls (reschedule / test).
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (!msg || !msg.type) return;
  if (msg.type === "owdle:sync") {
    storeSync(msg);
    sendResponse({ ok: true });
    return; // handled synchronously
  }
  if (msg.type === "reschedule") {
    scheduleNext().then(() => sendResponse({ ok: true }));
    return true; // async response
  }
  if (msg.type === "test") {
    notify(
      NOTIF.live,
      "OWdle reminder preview",
      "This is what a daily nudge looks like. Take your guess.",
    );
    sendResponse({ ok: true });
    return true;
  }
});
