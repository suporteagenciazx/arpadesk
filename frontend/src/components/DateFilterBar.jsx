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
  weekNavActive,
  weekInfo,
  onWeekShift,
  onSaveReport,
  savingReport,
  onImport,
  hasDraft,
  onSaveDraft,
  onCancelDraft,
  savingDraft,
  filtersLocked,
  restrictToAtual,
  paymentTotalToPay,
}) {
  const presetOptions = restrictToAtual ? DATE_PRESETS.filter((p) => p.id === "atual") : DATE_PRESETS;
  const weekDisabled = !weekNavActive || filtersLocked;
  const weekLabel = weekNavActive && weekInfo ? weekInfo.label : "";

  return (
    <div
      className={`date-filter-block${filtersLocked ? " date-filter-locked" : ""}${
        paymentTotalToPay != null ? " date-filter-block--payments" : ""
      }`}
    >
      <div className="date-filter-main">
        <div className="date-filter-left">
          <div className="filter-chips">
            {presetOptions.map((p) => (
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
            <form className="filter-bar filter-bar--inline filter-bar--custom-dates" onSubmit={onApplyCustom}>
              <div className="filter-date-field">
                <span className="filter-date-label">De</span>
                <input
                  type="date"
                  value={periodStart}
                  onChange={(e) => onPeriodStartChange(e.target.value)}
                  disabled={filtersLocked}
                />
              </div>
              <div className="filter-date-field">
                <span className="filter-date-label">Até</span>
                <input
                  type="date"
                  value={periodEnd}
                  onChange={(e) => onPeriodEndChange(e.target.value)}
                  disabled={filtersLocked}
                />
              </div>
              <button type="submit" className="btn btn-sm btn-primary" disabled={filtersLocked}>
                Filtrar
              </button>
            </form>
          )}
        </div>

        <div className="date-filter-right date-filter-right--inline date-filter-week-row">
          <div className="week-nav-group week-nav-group--fixed">
            {onSaveReport && (
              <button
                type="button"
                className="btn btn-sm btn-save-report"
                onClick={onSaveReport}
                disabled={!weekNavActive || savingReport || filtersLocked}
                title={!weekNavActive ? "Disponível apenas no filtro Atual" : "Salvar relatório da semana"}
              >
                <FloppyDiskIcon size={16} />
                Salvar relatório
              </button>
            )}
            <div
              className={`week-nav${weekDisabled ? " week-nav--disabled" : ""}`}
              role="group"
              aria-label="Navegar semanas"
            >
              <button
                type="button"
                className="week-nav-btn"
                onClick={() => onWeekShift?.(-1)}
                title="Semana anterior"
                aria-label="Semana anterior"
                disabled={weekDisabled}
              >
                <ChevronLeftIcon size={18} />
              </button>
              <span className={`week-nav-label${!weekLabel ? " week-nav-label--empty" : ""}`}>
                {weekLabel || "\u00A0"}
              </span>
              <button
                type="button"
                className="week-nav-btn"
                onClick={() => onWeekShift?.(1)}
                title="Próxima semana"
                aria-label="Próxima semana"
                disabled={weekDisabled}
              >
                <ChevronRightIcon size={18} />
              </button>
            </div>
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
          {paymentTotalToPay != null && (
            <div className="payment-total-card payment-total-card--inline">
              <span>Total a pagar no período</span>
              <strong>{fmtMoney(paymentTotalToPay)}</strong>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
