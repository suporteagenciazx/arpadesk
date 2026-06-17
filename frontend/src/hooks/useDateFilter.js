import { useCallback, useMemo, useState } from "react";
import {
  formatWeekInfo,
  getPresetRange,
  isOperationalWeekRange,
  shiftOperationalWeek,
} from "../lib/calendar";

export function useDateFilter(initialPreset = "atual") {
  const initial = getPresetRange(initialPreset);
  const [preset, setPreset] = useState(initialPreset);
  const [periodStart, setPeriodStart] = useState(initial.start);
  const [periodEnd, setPeriodEnd] = useState(initial.end);

  const applyPreset = useCallback((id, onRange) => {
    setPreset(id);
    if (id === "custom") return;
    const range = getPresetRange(id);
    setPeriodStart(range.start);
    setPeriodEnd(range.end);
    onRange?.(range.start, range.end);
  }, []);

  const shiftWeek = useCallback(
    (weeksDelta) => {
      const range = shiftOperationalWeek(periodStart, periodEnd, weeksDelta);
      setPeriodStart(range.start);
      setPeriodEnd(range.end);
      if (preset === "atual") setPreset("custom");
      return range;
    },
    [periodStart, periodEnd, preset]
  );

  const weekInfo = useMemo(
    () => formatWeekInfo(periodStart, periodEnd),
    [periodStart, periodEnd]
  );

  const showWeekNav = useMemo(
    () => isOperationalWeekRange(periodStart, periodEnd),
    [periodStart, periodEnd]
  );

  const params = () => {
    const p = {};
    if (periodStart) p.period_start = periodStart;
    if (periodEnd) p.period_end = periodEnd;
    return p;
  };

  return {
    preset,
    periodStart,
    periodEnd,
    setPeriodStart,
    setPeriodEnd,
    applyPreset,
    shiftWeek,
    weekInfo,
    showWeekNav,
    params,
  };
}
