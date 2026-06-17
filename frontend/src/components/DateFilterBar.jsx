import { DATE_PRESETS } from "../lib/calendar";
import { ChevronLeftIcon, ChevronRightIcon } from "./Icons";

export default function DateFilterBar({
  preset,
  onPresetChange,
  periodStart,
  periodEnd,
  onPeriodStartChange,
  onPeriodEndChange,
  onApplyCustom,
  showWeekNav,
  weekInfo,
  onWeekShift,
}) {
  return (
    <div className="date-filter-block">
      <div className="date-filter-top">
        <div className="filter-chips">
          {DATE_PRESETS.map((p) => (
            <button
              key={p.id}
              type="button"
              className={`btn btn-sm ${preset === p.id ? "btn-primary" : "btn-ghost"}`}
              onClick={() => onPresetChange(p.id)}
            >
              {p.label}
            </button>
          ))}
        </div>
        {showWeekNav && weekInfo && (
          <div className="week-nav" role="group" aria-label="Navegar semanas">
            <button
              type="button"
              className="week-nav-btn"
              onClick={() => onWeekShift?.(-1)}
              title="Semana anterior"
              aria-label="Semana anterior"
            >
              <ChevronLeftIcon size={18} />
            </button>
            <span className="week-nav-label">{weekInfo.label}</span>
            <button
              type="button"
              className="week-nav-btn"
              onClick={() => onWeekShift?.(1)}
              title="Próxima semana"
              aria-label="Próxima semana"
            >
              <ChevronRightIcon size={18} />
            </button>
          </div>
        )}
      </div>
      {preset === "custom" && (
        <form className="filter-bar" onSubmit={onApplyCustom}>
          <label>
            De
            <input type="date" value={periodStart} onChange={(e) => onPeriodStartChange(e.target.value)} />
          </label>
          <label>
            Até
            <input type="date" value={periodEnd} onChange={(e) => onPeriodEndChange(e.target.value)} />
          </label>
          <button type="submit" className="btn btn-primary">
            Filtrar
          </button>
        </form>
      )}
    </div>
  );
}
