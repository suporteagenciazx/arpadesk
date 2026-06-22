import { useCallback, useEffect, useMemo, useState } from "react";
import api from "../../lib/api";
import DateFilterBar from "../../components/DateFilterBar";
import SectorDots from "../../components/SectorDots";
import { useDateFilter } from "../../hooks/useDateFilter";
import { fmtMoney } from "../../lib/constants";

export default function GestaoDashboard() {
  const period = useDateFilter("atual");
  const [allProjects, setAllProjects] = useState([]);
  const [selectedIds, setSelectedIds] = useState([]);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    api
      .get("/api/gestao/projects")
      .then(({ data }) => {
        setAllProjects(data || []);
        setSelectedIds((data || []).map((p) => p.id));
      })
      .catch(() => setAllProjects([]));
  }, []);

  const load = useCallback(() => {
    if (selectedIds.length === 0) {
      setData(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError("");
    api
      .get("/api/gestao/dashboard", {
        params: {
          ...period.params(),
          project_ids: selectedIds.join(","),
        },
      })
      .then(({ data: d }) => setData(d))
      .catch((e) => setError(e.response?.data?.detail || "Erro ao carregar dashboard"))
      .finally(() => setLoading(false));
  }, [selectedIds, period.periodStart, period.periodEnd]);

  useEffect(() => {
    load();
  }, [load]);

  const toggleProject = (id) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const totals = data?.totals;

  const allSelected = useMemo(
    () => allProjects.length > 0 && selectedIds.length === allProjects.length,
    [allProjects, selectedIds]
  );

  return (
    <div className="gestao-dashboard">
      <DateFilterBar
        preset={period.preset}
        onPresetChange={(id) => period.applyPreset(id)}
        periodStart={period.periodStart}
        periodEnd={period.periodEnd}
        onPeriodStartChange={period.setPeriodStart}
        onPeriodEndChange={period.setPeriodEnd}
        onApplyCustom={() => period.setPeriodRange(period.periodStart, period.periodEnd)}
        weekNavActive={period.showWeekNav}
        weekInfo={period.weekInfo}
        onWeekShift={period.shiftWeek}
      />

      <div className="gestao-project-picker card">
        <div className="gestao-project-picker-head">
          <div>
            <strong>Projetos incluídos</strong>
            <p className="hint-inline">Selecione quais projetos entram no consolidado.</p>
          </div>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() =>
              setSelectedIds(allSelected ? [] : allProjects.map((p) => p.id))
            }
          >
            {allSelected ? "Desmarcar todos" : "Selecionar todos"}
          </button>
        </div>
        <div className="gestao-project-chips">
          {allProjects.map((p) => (
            <label
              key={p.id}
              className={`gestao-project-chip ${selectedIds.includes(p.id) ? "is-selected" : ""}`}
            >
              <input
                type="checkbox"
                checked={selectedIds.includes(p.id)}
                onChange={() => toggleProject(p.id)}
              />
              <SectorDots project={p} size="sm" />
              {p.name}
            </label>
          ))}
          {allProjects.length === 0 && <span className="muted">Nenhum projeto ativo.</span>}
        </div>
      </div>

      {error && <p className="error">{error}</p>}
      {loading && <p className="muted">Carregando indicadores...</p>}

      {!loading && totals && (
        <>
          <div className="stats-grid gestao-stats-grid">
            <div className="stat-card highlight">
              <span>Faturamento</span>
              <strong>{fmtMoney(totals.billing_total)}</strong>
            </div>
            <div className="stat-card">
              <span>Despesas</span>
              <strong className="negative">{fmtMoney(totals.expenses_total)}</strong>
            </div>
            <div className="stat-card">
              <span>Investimento</span>
              <strong>{fmtMoney(totals.investment_total)}</strong>
              <small className="muted">Despesas + comissões</small>
            </div>
            <div className="stat-card highlight-profit">
              <span>Lucro</span>
              <strong>{fmtMoney(totals.profit_total)}</strong>
            </div>
          </div>

          <div className="stats-grid gestao-kpi-grid">
            <div className="stat-card">
              <span>ROAS</span>
              <strong>{totals.roas_ratio != null ? `${totals.roas_ratio}×` : "—"}</strong>
              <small className="muted">Faturamento ÷ investimento</small>
            </div>
            <div className="stat-card">
              <span>ROI</span>
              <strong>{totals.roi_percent != null ? `${totals.roi_percent}%` : "—"}</strong>
              <small className="muted">Lucro ÷ investimento</small>
            </div>
            <div className="stat-card">
              <span>Comissões pagas</span>
              <strong>{fmtMoney(totals.commissions_paid_total)}</strong>
              <small className="muted">Pagamentos confirmados (sem admin)</small>
            </div>
          </div>

          <div className="table-wrap gestao-table-wrap card">
            <h3 className="section-title">Por projeto</h3>
            <table>
              <thead>
                <tr>
                  <th>Projeto</th>
                  <th>Faturamento</th>
                  <th>Despesas</th>
                  <th>Investimento</th>
                  <th>Lucro</th>
                  <th>Caixas</th>
                </tr>
              </thead>
              <tbody>
                {(data.by_project || []).map((row) => {
                  const proj = allProjects.find((p) => p.id === row.project_id);
                  return (
                    <tr key={row.project_id}>
                      <td>
                        <div className="gestao-table-project">
                          {proj && <SectorDots project={proj} size="sm" />}
                          <strong>{row.project_name}</strong>
                        </div>
                      </td>
                      <td>{fmtMoney(row.billing_total)}</td>
                      <td className="negative">{fmtMoney(row.expenses_total)}</td>
                      <td>{fmtMoney(row.investment_total)}</td>
                      <td className={row.profit_total >= 0 ? "positive" : "negative"}>
                        {fmtMoney(row.profit_total)}
                      </td>
                      <td>{row.cash_closings_count}</td>
                    </tr>
                  );
                })}
                {(data.by_project || []).length === 0 && (
                  <tr>
                    <td colSpan={6} className="muted center">
                      Selecione ao menos um projeto.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
