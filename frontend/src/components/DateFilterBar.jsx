import { DATE_PRESETS } from "../lib/calendar";
import { fmtMoney } from "../lib/constants";
import { ChevronLeftIcon, ChevronRightIcon, FloppyDiskIcon } from "./Icons";

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
  onImport,
  hasDraft,
  onSaveDraft,
  onCancelDraft,
  savingDraft,
  filtersLocked,
  paymentTotalToPay,
}) {
  const showWeekNavGroup = (showWeekNav && weekInfo) || onImport || hasDraft;

  return (
    <div
      className={`date-filter-block${filtersLocked ? " date-filter-locked" : ""}${
        paymentTotalToPay != null ? " date-filter-block--payments" : ""
      }`}
    >
      <div className="date-filter-main">
        <div className="date-filter-left">
          <div className="filter-chips">
            {DATE_PRESETS.map((p) => (
              <button
                key={p.id}
                type="button"
                className={`btn btn-sm ${preset === p.id ? "btn-primary" : "btn-ghost"}`}
                onClick={() => onPresetChange(p.id)}
                disabled={filtersLocked}
              >
                {p.label}
              </button>
            ))}
          </div>
          {preset === "custom" && (
            <form className="filter-bar filter-bar--inline" onSubmit={onApplyCustom}>
              <label>
                De
                <input
                  type="date"
                  value={periodStart}
                  onChange={(e) => onPeriodStartChange(e.target.value)}
                  disabled={filtersLocked}
                />
              </label>
              <label>
                Até
                <input
                  type="date"
                  value={periodEnd}
                  onChange={(e) => onPeriodEndChange(e.target.value)}
                  disabled={filtersLocked}
                />
              </label>
              <button type="submit" className="btn btn-primary" disabled={filtersLocked}>
                Filtrar
              </button>
            </form>
          )}
        </div>

        {(showWeekNavGroup || paymentTotalToPay != null) && (
          <div className="date-filter-right">
            {showWeekNavGroup && (
              <div className="week-nav-group">
                {showWeekNav && weekInfo && (
                  <div className="week-nav" role="group" aria-label="Navegar semanas">
                    <button
                      type="button"
                      className="week-nav-btn"
                      onClick={() => onWeekShift?.(-1)}
                      title="Semana anterior"
                      aria-label="Semana anterior"
                      disabled={filtersLocked}
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
                      disabled={filtersLocked}
                    >
                      <ChevronRightIcon size={18} />
                    </button>
                  </div>
                )}
                {hasDraft && onSaveDraft && (
                  <button
                    type="button"
                    className="btn btn-sm btn-primary btn-save-import"
                    onClick={onSaveDraft}
                    disabled={savingDraft}
                  >
                    <FloppyDiskIcon size={16} />
                    {savingDraft ? "Salvando..." : "Salvar"}
                  </button>
                )}
                {onImport && (
                  <button type="button" className="btn btn-sm btn-import-report" onClick={onImport}>
                    Importar
                  </button>
                )}
                {hasDraft && onCancelDraft && (
                  <button
                    type="button"
                    className="btn btn-sm btn-cancel-import-report"
                    onClick={onCancelDraft}
                  >
                    Cancelar
                  </button>
                )}
              </div>
            )}
            {paymentTotalToPay != null && (
              <div className="payment-total-card payment-total-card--stacked">
                <span>Total a pagar no período</span>
                <strong>{fmtMoney(paymentTotalToPay)}</strong>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
