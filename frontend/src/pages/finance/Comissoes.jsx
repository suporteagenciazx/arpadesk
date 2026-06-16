import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import api from "../../lib/api";
import DateFilterBar from "../../components/DateFilterBar";
import PeriodHint from "../../components/PeriodHint";
import FinanceTabGuard from "../../components/FinanceTabGuard";
import { UserIcon } from "../../components/Icons";
import { useDateFilter } from "../../hooks/useDateFilter";
import { fmtMoney, USER_LEVELS } from "../../lib/constants";

export default function Comissoes() {
  const { projectId } = useParams();
  const [summary, setSummary] = useState(null);
  const filter = useDateFilter("atual");

  const load = (start = filter.periodStart, end = filter.periodEnd) => {
    const params = {};
    if (start) params.period_start = start;
    if (end) params.period_end = end;
    api.get(`/api/projects/${projectId}/summary`, { params }).then(({ data }) => setSummary(data));
  };

  useEffect(() => {
    load();
  }, [projectId]);

  const levelLabel = (l) => USER_LEVELS.find((x) => x.value === l)?.label || l;

  return (
    <FinanceTabGuard tab="comissoes">
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
        />

        <PeriodHint start={filter.periodStart} end={filter.periodEnd} preset={filter.preset} />

        {!summary ? (
          <p>Carregando...</p>
        ) : (
          <>
            <div className="stats-grid">
              <div className="stat-card">
                <span>Vendas (OK)</span>
                <strong>{fmtMoney(summary.total_sales)}</strong>
              </div>
              <div className="stat-card">
                <span>Comissões</span>
                <strong>{fmtMoney(summary.total_commissions)}</strong>
              </div>
              <div className="stat-card">
                <span>Despesas</span>
                <strong className="negative">{fmtMoney(summary.total_expenses)}</strong>
              </div>
              <div className="stat-card highlight">
                <span>Saldo (lucro admin)</span>
                <strong>{fmtMoney(summary.balance)}</strong>
              </div>
            </div>

            <p className="hint">
              Contador e financeiro: % sobre todas as vendas OK. Ilustrativos: % apenas nas vendas em que
              são o gerente.
            </p>

            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Colaborador</th>
                    <th>Nível</th>
                    <th>%</th>
                    <th>Base</th>
                    <th>Comissão</th>
                  </tr>
                </thead>
                <tbody>
                  {summary.commissions.map((c) => (
                    <tr key={c.user_id}>
                      <td>
                        <span className="user-cell">
                          <span className="user-avatar-icon">
                            <UserIcon size={16} />
                          </span>
                          {c.user_name}
                        </span>
                      </td>
                      <td>{levelLabel(c.user_level)}</td>
                      <td>{c.commission_percent}%</td>
                      <td>{fmtMoney(c.total_sales_base)}</td>
                      <td>{fmtMoney(c.commission_amount)}</td>
                    </tr>
                  ))}
                  {summary.commissions.length === 0 && (
                    <tr>
                      <td colSpan={5} className="muted center">
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
