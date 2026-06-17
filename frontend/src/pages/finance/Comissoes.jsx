import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import api from "../../lib/api";
import FinanceTabGuard from "../../components/FinanceTabGuard";
import { UserIcon } from "../../components/Icons";
import { useFinancePeriod, useImportPreviewSummary } from "../../context/FinancePeriodContext";
import { fmtMoney } from "../../lib/constants";

export default function Comissoes() {
  const { projectId } = useParams();
  const period = useFinancePeriod();
  const [summary, setSummary] = useState(null);

  const load = () => {
    if (period.hasDraft && period.importDraft?.preview?.summary) {
      setSummary(period.importDraft.preview.summary);
      return;
    }
    api
      .get(`/api/projects/${projectId}/summary`, { params: period.params() })
      .then(({ data }) => setSummary(data));
  };

  useEffect(() => {
    load();
  }, [projectId, period.periodStart, period.periodEnd, period.reloadToken, period.importDraft]);

  const displaySummary = useImportPreviewSummary(summary);

  return (
    <FinanceTabGuard tab="comissoes">
      <div>
        {!displaySummary ? (
          <p>Carregando...</p>
        ) : (
          <>
            <div className="stats-grid">
              <div className="stat-card">
                <span>Vendas (OK)</span>
                <strong>{fmtMoney(displaySummary.total_sales)}</strong>
              </div>
              <div className="stat-card">
                <span>Comissões</span>
                <strong>{fmtMoney(displaySummary.total_commissions)}</strong>
              </div>
              <div className="stat-card">
                <span>Despesas</span>
                <strong className="negative">{fmtMoney(displaySummary.total_expenses)}</strong>
              </div>
              <div className="stat-card highlight">
                <span>Saldo (lucro admin)</span>
                <strong>{fmtMoney(displaySummary.balance)}</strong>
              </div>
            </div>

            <p className="hint">
              Contador e financeiro: % sobre todas as vendas OK. Ilustrativos: % apenas nas vendas em que
              são o gerente.
              {displaySummary.uses_period_commissions && (
                <>
                  {" "}
                  Período com relatório importado — % e valores conforme o PDF daquele período.
                </>
              )}
            </p>

            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Colaborador</th>
                    <th>%</th>
                    <th>Base</th>
                    <th>Comissão</th>
                  </tr>
                </thead>
                <tbody>
                  {(displaySummary.commissions || []).map((c) => (
                    <tr key={c.user_id}>
                      <td>
                        <span className="user-cell">
                          <span className="user-avatar-icon">
                            <UserIcon size={16} />
                          </span>
                          {c.user_name}
                        </span>
                      </td>
                      <td>{c.commission_percent}%</td>
                      <td>{fmtMoney(c.total_sales_base)}</td>
                      <td>{fmtMoney(c.commission_amount)}</td>
                    </tr>
                  ))}
                  {(displaySummary.commissions || []).length === 0 && (
                    <tr>
                      <td colSpan={4} className="muted center">
                        Nenhum colaborador com comissão no período.
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
