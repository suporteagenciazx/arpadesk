import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import api from "../../lib/api";
import { useFinancePeriod } from "../../context/FinancePeriodContext";
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

export default function MarketingRelatorio() {
  const { projectId } = useParams();
  const period = useFinancePeriod();
  const [report, setReport] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const periodReady = Boolean(period.periodStart && period.periodEnd);
  const periodLabel =
    report?.description || period.weekInfo?.label || "Período selecionado";

  useEffect(() => {
    if (!periodReady) {
      setLoading(false);
      setReport(null);
      return;
    }
    setLoading(true);
    setError("");
    api
      .get(`/api/projects/${projectId}/marketing/report`, {
        params: {
          period_start: period.periodStart,
          period_end: period.periodEnd,
          expense_mode: "marketing",
        },
      })
      .then(({ data }) => setReport(data))
      .catch((e) => setError(e.response?.data?.detail || "Erro ao carregar relatório"))
      .finally(() => setLoading(false));
  }, [projectId, period.periodStart, period.periodEnd, period.reloadToken, periodReady]);

  return (
    <div className="marketing-relatorio page-content-inner">
      <div className="marketing-report-toolbar">
        <p className="hint marketing-report-period">
          {periodLabel}
          {report?.report_saved && <span className="badge badge-sm">Relatório salvo</span>}
        </p>
      </div>

      {error && <p className="error">{error}</p>}
      {!periodReady && <p className="muted">Aguardando calendário do projeto...</p>}
      {periodReady && loading && <p className="muted">Carregando relatório...</p>}

      {periodReady && !loading && report && (
        <>
          <div className="stats-grid">
            <div className="stat-card highlight">
              <span>Faturamento</span>
              <strong>{fmtMoney(report.billing_total)}</strong>
            </div>
            <div className="stat-card">
              <span>Total despesas</span>
              <strong className="negative">{fmtMoney(report.all_expenses_total)}</strong>
              <small className="muted">Despesas gerais + divulgação</small>
            </div>
            <div className="stat-card">
              <span>Clientes recebidos</span>
              <strong>{report.clients_received != null ? report.clients_received : "—"}</strong>
            </div>
            <div className="stat-card highlight-profit">
              <span>Lucro</span>
              <strong>{fmtMoney(report.profit)}</strong>
            </div>
          </div>

          <div className="stats-grid marketing-kpi-grid">
            <div className="stat-card">
              <span>ROAS</span>
              <strong>{report.roas_ratio != null ? `${report.roas_ratio}×` : "—"}</strong>
            </div>
            <div className="stat-card">
              <span>ROI</span>
              <strong>{report.roi_percent != null ? `${report.roi_percent}%` : "—"}</strong>
            </div>
            <div className="stat-card">
              <span>Mensagens enviadas</span>
              <strong>{report.messages_sent_total || "—"}</strong>
              <small className="muted">
                {report.sms_sent_total} SMS · {report.whatsapp_sent_total} WhatsApp
              </small>
            </div>
            <div className="stat-card">
              <span>Investimento (divulgação)</span>
              <strong className="negative">{fmtMoney(report.investment_total)}</strong>
            </div>
          </div>

          {report.comparison && (
            <div className="stats-grid">
              <PctBadge value={report.comparison.billing_pct} label="Faturamento" />
              <PctBadge value={report.comparison.investment_pct} label="Investimento" />
              <PctBadge value={report.comparison.clients_pct} label="Clientes" />
              <PctBadge value={report.comparison.profit_pct} label="Lucro" />
            </div>
          )}

          <div className="report-insights">
            <div className="card">
              <h3>Destaques do período</h3>
              <ul className="insight-list">
                <li>
                  <strong>Listas cadastradas:</strong> {report.list_count}
                </li>
                <li>
                  <strong>Investimento em listas:</strong> {fmtMoney(report.list_investment_total)}
                </li>
                <li>
                  <strong>Despesas divulgação:</strong> {fmtMoney(report.marketing_expenses_total)}
                </li>
                <li>
                  <strong>Despesas totais:</strong> {fmtMoney(report.all_expenses_total)}
                </li>
              </ul>
            </div>
          </div>

          <div className="table-wrap">
            <h3 className="section-title">Listas do período</h3>
            <table>
              <thead>
                <tr>
                  <th>Lista</th>
                  <th>Canal</th>
                  <th>Exportação</th>
                  <th>Envio</th>
                  <th>Investido</th>
                  <th>Mensagens</th>
                </tr>
              </thead>
              <tbody>
                {(report.lists || []).map((lst) => (
                  <tr key={lst.id}>
                    <td>{lst.name}</td>
                    <td>{lst.channel === "whatsapp" ? "WhatsApp" : "SMS"}</td>
                    <td>{lst.exported_at ? fmtDate(lst.exported_at) : "—"}</td>
                    <td>{lst.sent_at ? fmtDate(lst.sent_at) : "—"}</td>
                    <td>{fmtMoney(lst.investment_amount)}</td>
                    <td>{lst.message_count}</td>
                  </tr>
                ))}
                {(report.lists || []).length === 0 && (
                  <tr>
                    <td colSpan={6} className="muted center">
                      Nenhuma lista neste período. Cadastre em Campanhas → Listas.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}

      {periodReady && !loading && !report && !error && (
        <p className="muted">Nenhum dado para o período selecionado.</p>
      )}
    </div>
  );
}
