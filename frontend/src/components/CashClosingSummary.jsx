import { fmtMoney, fmtDate } from "../lib/constants";
import { SALE_STATUSES } from "../lib/constants";

const statusLabel = (value) => SALE_STATUSES.find((s) => s.value === value)?.label || value;

export function fmtDateTime(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("pt-BR");
}

export default function CashClosingSummary({ snapshot }) {
  if (!snapshot) return null;
  const sales = snapshot.sales || [];
  const fines = snapshot.fines || [];
  const commissions = snapshot.commissions || [];
  return (
    <div className="cash-closing">
      <div className="cash-closing-total">
        <span>FATURAMENTO FINAL:</span>
        <strong>{fmtMoney(snapshot.billing_total)}</strong>
      </div>
      <p className="hint cash-closing-meta">
        {snapshot.sales_count} venda(s) no período · {snapshot.ok_sales_count} confirmada(s) (OK):{" "}
        {fmtMoney(snapshot.ok_total)}
      </p>
      {sales.length > 0 ? (
        <div className="table-wrap cash-closing-table">
          <table>
            <thead>
              <tr>
                <th>Código</th>
                <th>Agente</th>
                <th>Valor</th>
                <th>Data</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {sales.map((s) => (
                <tr key={s.id}>
                  <td>
                    <code>{s.sale_code}</code>
                  </td>
                  <td>{s.participant_name}</td>
                  <td>{fmtMoney(s.amount)}</td>
                  <td>{fmtDate(s.sale_date)}</td>
                  <td>{statusLabel(s.status)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="muted">Nenhuma venda registrada nesta semana.</p>
      )}
      <div className="cash-closing-section">
        <h4>Multas</h4>
        {fines.length > 0 ? (
          <>
            <div className="table-wrap cash-closing-table">
              <table>
                <thead>
                  <tr>
                    <th>Gerente</th>
                    <th>Valor descontado</th>
                  </tr>
                </thead>
                <tbody>
                  {fines.map((f) => (
                    <tr key={f.id}>
                      <td>{f.participant_name}</td>
                      <td>{fmtMoney(f.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="cash-closing-fine-total">Total em multas: {fmtMoney(snapshot.fines_total)}</p>
          </>
        ) : (
          <p className="muted">Nenhuma multa registrada no período.</p>
        )}
      </div>
      <div className="cash-closing-section">
        <h4>Comissões</h4>
        {commissions.length > 0 ? (
          <div className="cash-closing-commissions">
            {commissions.map((row) => (
              <div key={row.name} className="cash-closing-commission-row">
                <div>
                  <strong>{row.name}</strong>
                  <small>
                    Faturamento: {fmtMoney(row.billing)} ({row.percent}%)
                    {row.fine > 0 && ` · Multa: ${fmtMoney(row.fine)}`}
                  </small>
                </div>
                <strong className={row.net < 0 ? "amount-negative" : ""}>{fmtMoney(row.net)}</strong>
              </div>
            ))}
          </div>
        ) : (
          <p className="muted">Nenhum gerente cadastrado no projeto.</p>
        )}
      </div>
    </div>
  );
}
