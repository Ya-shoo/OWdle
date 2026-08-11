"use client";

// Single line on DailyCompletePanel:
//   Finish-rate: "<X>% of starters finished today's set"
//
// Renders nothing when the finishers/starters denominator is below
// MIN_SAMPLE (see lib/stats). A sweep-rate line used to sit below this
// ("Top <Y>% of today's finishers"), but its wording collided with the
// real Daily Rank percentile right beneath it — a sweep rate is a
// population stat, not a rank — so it read as a contradiction and was
// removed.

import { dailyFinishPercent, useDailyStats } from "@/lib/stats";

export function DailyStatsBand() {
  const stats = useDailyStats();
  const finish = dailyFinishPercent(stats);

  if (!finish) return null;

  return (
    <div className="utility-label mt-3 flex flex-col items-center gap-1 text-center text-[10px] text-info">
      <p>{finish.percent}% of starters finished today&apos;s set</p>
    </div>
  );
}
