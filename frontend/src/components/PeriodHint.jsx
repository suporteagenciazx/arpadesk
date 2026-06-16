import { fmtDate } from "../lib/constants";

export default function PeriodHint({ start, end, preset }) {
  if (!start && !end) return null;
  return (
    <p className="hint report-period">
      Período: {fmtDate(start)} — {fmtDate(end)}
      {preset === "atual" && " (semana operacional — segunda a sexta)"}
    </p>
  );
}
