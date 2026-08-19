"use client";

// Dev-only affordance: pop the first-visit tutorial card on demand, without
// clearing localStorage or pretending to be a new browser. Dispatches the
// same "owdle:show-tutorial" event WelcomeTutorial listens for in dev. Gated
// on the build-time NODE_ENV constant, so the whole thing tree-shakes out of
// production (returns null, exactly like DevThemeSwitcher).

export function WelcomeTutorialDevTrigger() {
  if (process.env.NODE_ENV !== "development") return null;

  return (
    <button
      type="button"
      onClick={() =>
        window.dispatchEvent(new Event("owdle:show-tutorial"))
      }
      className="utility-label fixed bottom-20 left-3 z-50 rounded-full bg-info px-3 py-2 text-[10px] text-on-info shadow-lg transition-all hover:brightness-110 active:scale-[0.98]"
      title="Dev: preview the first-visit tutorial card"
    >
      Show tutorial
    </button>
  );
}
