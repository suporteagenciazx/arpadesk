import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import api from "../../lib/api";
import FinanceTabGuard from "../../components/FinanceTabGuard";
import {
  useFinancePeriod,
  useImportPreviewData,
} from "../../context/FinancePeriodContext";
import { fmtMoney, fmtDateTime } from "../../lib/constants";
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
  const period = useFinancePeriod();
  const [report, setReport] = useState(null);
  const [logs, setLogs] = useState([]);
  const [error, setError] = useState("");

  const load = () => {
    if (period.hasDraft && period.importDraft?.preview?.report) {
      setReport(period.importDraft.preview.report);
      setLogs([]);
      return;
    }
    const params = period.params();
    api
      .get(`/api/projects/${projectId}/report`, { params })
      .then(({ data }) => setReport(data))
      .catch((e) => setError(e.response?.data?.detail || "Erro ao carregar relatório"));

    api
      .get(`/api/projects/${projectId}/report-imports/logs`, { params })
      .then(({ data }) => setLogs(data || []))
      .catch(() => setLogs([]));
  };

  useEffect(() => {
    load();
  }, [projectId, period.periodStart, period.periodEnd, period.reloadToken, period.importDraft]);

  const displayReport = useImportPreviewData(report, "report") || report;

  return (
    <FinanceTabGuard tab="relatorio">
      <div>
        {error && <p className="error">{error}</p>}
        {!displayReport ? (
          <p className="muted">Carregando relatório...</p>
        ) : (
          <>
            <div className="stats-grid">
              <div className="stat-card">
                <span>Vendas (OK)</span>
                <strong>{fmtMoney(displayReport.total_sales)}</strong>
                <small>{displayReport.ok_sales_count} vendas</small>
              </div>
              <div className="stat-card">
                <span>Ticket médio</span>
                <strong>{fmtMoney(displayReport.avg_ticket)}</strong>
              </div>
              <div className="stat-card">
                <span>Despesas</span>
                <strong className="negative">{fmtMoney(displayReport.total_expenses)}</strong>
              </div>
              <div className="stat-card highlight">
                <span>Lucro</span>
                <strong>{fmtMoney(displayReport.profit)}</strong>
              </div>
            </div>

            {displayReport.comparison && (
              <div className="stats-grid">
                <PctBadge value={displayReport.comparison?.sales_pct} label="Vendas" />
                <PctBadge value={displayReport.comparison?.expenses_pct} label="Despesas" />
                <PctBadge value={displayReport.comparison?.profit_pct} label="Lucro" />
                <div className="stat-card">
                  <span>vs semana passada (lucro)</span>
                  <strong>{formatPctChange(displayReport.week_comparison?.profit_pct)}</strong>
                </div>
              </div>
            )}

            <div className="report-insights">
              <div className="card">
                <h3>Destaques</h3>
                <ul className="insight-list">
                  <li>
                    <strong>Vendas bloqueadas:</strong> {displayReport.blocked_sales_count}
                  </li>
                  <li>
                    <strong>Em análise:</strong> {displayReport.analysis_sales_count}
                  </li>
                  <li>
                    <strong>Pendentes:</strong> {displayReport.pending_sales_count}
                  </li>
                  {displayReport.highest_sale && (
                    <li>
                      <strong>Maior venda:</strong> {displayReport.highest_sale.sale_code} —{" "}
                      {fmtMoney(displayReport.highest_sale.amount)} ({displayReport.highest_sale.participant_name})
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
                  {(displayReport.sales_by_manager || []).map((m) => (
                    <tr key={m.participant_id || m.participant_name}>
                      <td>{m.participant_name}</td>
                      <td>{m.sales_count}</td>
                      <td>{fmtMoney(m.total_amount)}</td>
                    </tr>
                  ))}
                  {(displayReport.sales_by_manager || []).length === 0 && (
                    <tr>
                      <td colSpan={3} className="muted center">
                        Nenhuma venda OK no período.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <div className="card report-import-log">
              <h3>Registro de salvamentos</h3>
              {logs.length === 0 ? (
                <p className="muted">Nenhum salvamento registrado para este período.</p>
              ) : (
                <ul className="insight-list">
                  {logs.map((log) => (
                    <li key={log.id}>
                      <strong>{fmtDateTime(log.saved_at)}</strong>
                      {log.original_filename && ` — ${log.original_filename}`}
                      {log.created_by_name && ` (${log.created_by_name})`}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </>
        )}
      </div>
    </FinanceTabGuard>
  );
}
