import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import api from "../../lib/api";
import DateFilterBar from "../../components/DateFilterBar";
import PeriodHint from "../../components/PeriodHint";
import FinanceTabGuard from "../../components/FinanceTabGuard";
import { useDateFilter } from "../../hooks/useDateFilter";
import { fmtMoney, fmtDate } from "../../lib/constants";
import { formatPctChange } from "../../lib/masks";

function PctBadge({ value, label }) {
  if (value === null || value === undefined) return null;
  const up = value > 0;
  const down = value < 0;
  return (
    <div className={`stat-card ${up ? "stat-up" : down ? "stat-down" : ""}`}>
      <span>{label}</span>
      <strong>{formatPctChange(value)}</strong>
      <small className="muted">vs período anterior</small>
    </div>
  );
}

export default function Relatorio() {
  const { projectId } = useParams();
  const [report, setReport] = useState(null);
  const [error, setError] = useState("");
  const filter = useDateFilter("atual");

  const load = (start = filter.periodStart, end = filter.periodEnd) => {
    const params = {};
    if (start) params.period_start = start;
    if (end) params.period_end = end;
    api
      .get(`/api/projects/${projectId}/report`, { params })
      .then(({ data }) => setReport(data))
      .catch((e) => setError(e.response?.data?.detail || "Erro ao carregar relatório"));
  };

  useEffect(() => {
    load();
  }, [projectId]);

  return (
    <FinanceTabGuard tab="relatorio">
      <div>
        <DateFilterBar
          preset={filter.preset}
          onPresetChange={(id) => filter.applyPreset(id, load)}
          periodStart={filter.periodStart}
          periodEnd={filter.periodEnd}
          onPeriodStartChange={filter.setPeriodStart}
          onPeriodEndChange={filter.setPeriodEnd}
        onApplyCustom={(e) => {
          e.preventDefault();
          load(filter.periodStart, filter.periodEnd);
        }}
        showWeekNav={filter.showWeekNav}
        weekInfo={filter.weekInfo}
        onWeekShift={(delta) => {
          const r = filter.shiftWeek(delta);
          load(r.start, r.end);
        }}
      />

        <PeriodHint start={filter.periodStart} end={filter.periodEnd} preset={filter.preset} weekInfo={filter.weekInfo} />

        {error && <p className="error">{error}</p>}
        {!report ? (
          <p className="muted">Carregando relatório...</p>
        ) : (
          <>
            <div className="stats-grid">
              <div className="stat-card">
                <span>Vendas (OK)</span>
                <strong>{fmtMoney(report.total_sales)}</strong>
                <small>{report.ok_sales_count} vendas</small>
              </div>
              <div className="stat-card">
                <span>Ticket médio</span>
                <strong>{fmtMoney(report.avg_ticket)}</strong>
              </div>
              <div className="stat-card">
                <span>Despesas</span>
                <strong className="negative">{fmtMoney(report.total_expenses)}</strong>
              </div>
              <div className="stat-card highlight">
                <span>Lucro</span>
                <strong>{fmtMoney(report.profit)}</strong>
              </div>
            </div>

            <div className="stats-grid">
              <PctBadge value={report.comparison?.sales_pct} label="Vendas" />
              <PctBadge value={report.comparison?.expenses_pct} label="Despesas" />
              <PctBadge value={report.comparison?.profit_pct} label="Lucro" />
              <div className="stat-card">
                <span>vs semana passada (lucro)</span>
                <strong>{formatPctChange(report.week_comparison?.profit_pct)}</strong>
              </div>
            </div>

            <div className="report-insights">
              <div className="card">
                <h3>Destaques</h3>
                <ul className="insight-list">
                  <li>
                    <strong>Vendas bloqueadas:</strong> {report.blocked_sales_count}
                  </li>
                  <li>
                    <strong>Em análise:</strong> {report.analysis_sales_count}
                  </li>
                  <li>
                    <strong>Pendentes:</strong> {report.pending_sales_count}
                  </li>
                  {report.highest_sale && (
                    <li>
                      <strong>Maior venda:</strong> {report.highest_sale.sale_code} —{" "}
                      {fmtMoney(report.highest_sale.amount)} ({report.highest_sale.participant_name})
                    </li>
                  )}
                </ul>
              </div>
            </div>

            <div className="table-wrap">
              <h3 className="section-title">Vendas por gerente (OK)</h3>
              <table>
                <thead>
                  <tr>
                    <th>Gerente</th>
                    <th>Qtd vendas</th>
                    <th>Total</th>
                  </tr>
                </thead>
                <tbody>
                  {report.sales_by_manager.map((m) => (
                    <tr key={m.participant_id}>
                      <td>{m.participant_name}</td>
                      <td>{m.sales_count}</td>
                      <td>{fmtMoney(m.total_amount)}</td>
                    </tr>
                  ))}
                  {report.sales_by_manager.length === 0 && (
                    <tr>
                      <td colSpan={3} className="muted center">
                        Nenhuma venda OK no período.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </FinanceTabGuard>
  );
}
