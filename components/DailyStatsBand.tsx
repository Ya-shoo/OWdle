"use client";

// Two stacked lines on DailyCompletePanel:
//   1. Finish-rate: "<X>% of starters finished today's set"
//   2. Sweep-rate, personalized:
//        - swept locally → "Top <Y>% of today's finishers"
//        - did not sweep → "<Y>% of finishers swept today"
//
// Each line hides independently when its denominator is below MIN_SAMPLE.
// If both hide, the component renders nothing. The personalization on
// the sweep line uses a localStorage scan so we don't have to thread a
// `swept` prop through every caller of DailyCompletePanel.

import { useEffect, useState } from "react";
import { dayString } from "@/lib/daily";
import { BUILT_MODE_SLUGS } from "@/lib/modes";
import { loadModeState } from "@/lib/storage";
import {
  dailyFinishPercent,
  dailySweepPercent,
  useDailyStats,
} from "@/lib/stats";

export function DailyStatsBand() {
  const stats = useDailyStats();
  const [swept, setSwept] = useState<boolean | null>(null);

  useEffect(() => {
    const day = dayString();
    let allWon = true;
    for (const slug of BUILT_MODE_SLUGS) {
      const st = loadModeState(slug, day);
      if (!st.won) {
        allWon = false;
        break;
      }
    }
    setSwept(allWon);
  }, []);

  const finish = dailyFinishPercent(stats);
  const sweep = dailySweepPercent(stats);
  const sweepReady = sweep != null && swept != null;

  if (!finish && !sweepReady) return null;

  return (
    <div className="utility-label mt-3 flex flex-col items-center gap-1 text-center text-[10px] text-info">
      {finish && (
        <p>{finish.percent}% of starters finished today&apos;s set</p>
      )}
      {sweepReady && (
        <p>
          {swept
            ? `Top ${sweep.sweepPercent}% of today's finishers`
            : `${sweep.sweepPercent}% of finishers swept today`}
        </p>
      )}
    </div>
  );
}
