import { DATE_PRESETS } from "../lib/helpers";

export default function DateFilterBar({
  preset,
  onPresetChange,
  periodStart,
  periodEnd,
  onPeriodStartChange,
  onPeriodEndChange,
  onApplyCustom,
}) {
  return (
    <div className="date-filter-block">
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
