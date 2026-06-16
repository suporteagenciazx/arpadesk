import { useCallback, useState } from "react";
import { getPresetRange } from "../lib/helpers";

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
    params,
  };
}
