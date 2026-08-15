// Popup UI: shows the current streak/today status and lets the user tune the
// reminder settings. All state lives in chrome.storage.local; changing the
// hour or the master switch asks the background worker to reschedule.

const OWDLE_URL = "https://playowdle.com/";

const DEFAULTS = {
  enabled: true,
  hour: 17,
  streakOnly: false,
  feedbackAsks: true,
};

const $ = (id) => document.getElementById(id);

function fmtHour(h) {
  const ampm = h < 12 ? "AM" : "PM";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return h12 + " " + ampm;
}

function buildHourOptions(selected) {
  const sel = $("hour");
  for (let h = 0; h < 24; h++) {
    const o = document.createElement("option");
    o.value = String(h);
    o.textContent = fmtHour(h);
    if (h === selected) o.selected = true;
    sel.appendChild(o);
  }
}

function renderStatus(sync) {
  const today = owdleDayString();
  const el = $("today");
  const nEl = $("streak-n");

  if (!sync) {
    nEl.textContent = "0";
    el.textContent = "Open OWdle to sync";
    el.className = "today nosync";
    return;
  }

  const current = Number(sync.current) || 0;
  const last = sync.lastCompletedDay;
  const playedToday =
    last === today || (sync.day === today && sync.todayDone === true);

  // If the last completed day is older than yesterday, the streak has lapsed.
  const alive = last === today || last === owdlePrevDay(today);
  nEl.textContent = String(alive ? current : 0);

  if (playedToday) {
    el.textContent = "Done today ✓";
    el.className = "today done";
  } else {
    el.textContent = "Not played yet";
    el.className = "today todo";
  }
}

function applyEnabledState(enabled) {
  $("sub-settings").classList.toggle("disabled", !enabled);
}

async function save(partial) {
  const { settings } = await chrome.storage.local.get("settings");
  const next = Object.assign({}, DEFAULTS, settings || {}, partial);
  await chrome.storage.local.set({ settings: next });
  return next;
}

function reschedule() {
  chrome.runtime.sendMessage({ type: "reschedule" }, () => {
    void chrome.runtime.lastError;
  });
}

async function init() {
  const { settings, sync } = await chrome.storage.local.get([
    "settings",
    "sync",
  ]);
  const s = Object.assign({}, DEFAULTS, settings || {});

  renderStatus(sync || null);
  buildHourOptions(s.hour);
  $("enabled").checked = s.enabled;
  $("streakOnly").checked = s.streakOnly;
  $("feedbackAsks").checked = s.feedbackAsks;
  applyEnabledState(s.enabled);

  $("play").addEventListener("click", () => {
    chrome.tabs.create({ url: OWDLE_URL });
    window.close();
  });

  $("enabled").addEventListener("change", async (e) => {
    await save({ enabled: e.target.checked });
    applyEnabledState(e.target.checked);
    reschedule();
  });

  $("hour").addEventListener("change", async (e) => {
    await save({ hour: parseInt(e.target.value, 10) });
    reschedule();
  });

  $("streakOnly").addEventListener("change", (e) =>
    save({ streakOnly: e.target.checked }),
  );

  $("feedbackAsks").addEventListener("change", (e) =>
    save({ feedbackAsks: e.target.checked }),
  );

  $("test").addEventListener("click", () => {
    chrome.runtime.sendMessage({ type: "test" }, () => {
      void chrome.runtime.lastError;
    });
  });
}

init();
