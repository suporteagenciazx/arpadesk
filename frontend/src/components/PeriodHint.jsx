import { fmtDate } from "../lib/constants";
import { formatWeekInfo, todayLocalIso } from "../lib/calendar";

export default function PeriodHint({ activePeriod }) {
  const today = todayLocalIso();
  const openingDate = activePeriod?.next_opening_date || activePeriod?.period_start;
  const beforeOpen = Boolean(openingDate && today < openingDate);
  const activeWeekInfo =
    activePeriod?.period_start && activePeriod?.period_end
      ? formatWeekInfo(activePeriod.period_start, activePeriod.period_end)
      : null;

  return (
    <div className="period-status-block">
      <p className="hint report-period period-status-line">🟢 Hoje {fmtDate(today)}</p>
      {beforeOpen && openingDate && (
        <p className="hint report-period period-status-line period-status-opening-line">
          · Próxima abertura de caixa programada para {fmtDate(openingDate)}
          {activeWeekInfo?.label ? ` (${activeWeekInfo.label})` : ""}
        </p>
      )}
    </div>
  );
}
