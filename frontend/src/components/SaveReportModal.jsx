import { fmtMoney, fmtDate, SALE_STATUSES } from "../lib/constants";

const statusLabel = (value) => SALE_STATUSES.find((s) => s.value === value)?.label || value;

function formatPeriodRange(start, end) {
  if (!start || !end) return "—";
  return `${fmtDate(start)} — ${fmtDate(end)}`;
}

export default function SaveReportModal({
  open,
  preview,
  loading,
  saving,
  clientsReceived,
  onClientsReceivedChange,
  onClose,
  onConfirm,
}) {
  if (!open) return null;

  return (
    <div className="save-report-modal">
      {loading ? (
        <p className="muted">Carregando resumo...</p>
      ) : preview ? (
        <>
          <p className="save-report-period">
            Período do relatório: {formatPeriodRange(preview.period_start, preview.period_end)}
          </p>

          <div className="save-report-hero stats-grid">
            <div className="stat-card highlight">
              <span>Faturamento</span>
              <strong>{fmtMoney(preview.billing_total)}</strong>
            </div>
            <div className="stat-card">
              <span>Despesas</span>
              <strong className="negative">{fmtMoney(preview.expenses_total)}</strong>
            </div>
            <div className="stat-card">
              <span>Comissões</span>
              <strong>{fmtMoney(preview.commissions_paid_ex_admin)}</strong>
            </div>
            <div className="stat-card highlight-profit">
              <span>Lucro</span>
              <strong>{fmtMoney(preview.profit)}</strong>
            </div>
            <div className="stat-card">
              <span>Vendas</span>
              <strong>
                {preview.sales_count}
                <small className="save-report-stat-sub"> · {preview.ok_sales_count} OK</small>
              </strong>
            </div>
            <div className="stat-card">
              <span>ROI</span>
              <strong>{preview.roi_percent != null ? `${preview.roi_percent}%` : "—"}</strong>
            </div>
          </div>

          <div className="save-report-sections">
            <div className="save-report-section">
              <h4>Vendas ({preview.sales?.length || 0})</h4>
              {(preview.sales || []).length > 0 ? (
                <div className="table-wrap save-report-table">
                  <table>
                    <thead>
                      <tr>
                        <th>Código</th>
                        <th>Agente</th>
                        <th>Valor</th>
                        <th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {preview.sales.map((s) => (
                        <tr key={s.id}>
                          <td>
                            <code>{s.sale_code}</code>
                          </td>
                          <td>{s.participant_name}</td>
                          <td>{fmtMoney(s.amount)}</td>
                          <td>{statusLabel(s.status)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="muted save-report-empty">Nenhuma venda no período.</p>
              )}
            </div>

            <div className="save-report-section">
              <h4>Despesas ({preview.expenses?.length || 0})</h4>
              {(preview.expenses || []).length > 0 ? (
                <div className="table-wrap save-report-table">
                  <table>
                    <thead>
                      <tr>
                        <th>Tipo</th>
                        <th>Valor</th>
                        <th>Obs.</th>
                      </tr>
                    </thead>
                    <tbody>
                      {preview.expenses.map((e) => (
                        <tr key={e.id}>
                          <td>{e.expense_type}</td>
                          <td className="negative">{fmtMoney(e.amount)}</td>
                          <td>{e.notes || "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="muted save-report-empty">Nenhuma despesa no período.</p>
              )}
            </div>

            <div className="save-report-section">
              <h4>Comissões ({preview.commissions?.length || 0})</h4>
              {(preview.commissions || []).length > 0 ? (
                <div className="table-wrap save-report-table">
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
                      {preview.commissions.map((c) => (
                        <tr key={c.user_id}>
                          <td>{c.user_name}</td>
                          <td>{c.commission_percent}%</td>
                          <td>{fmtMoney(c.total_sales_base)}</td>
                          <td>{fmtMoney(c.commission_amount)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="muted save-report-empty">Nenhuma comissão no período.</p>
              )}
            </div>

            <div className="save-report-section">
              <h4>Pagamentos ({preview.payments?.length || 0})</h4>
              {(preview.payments || []).length > 0 ? (
                <div className="table-wrap save-report-table">
                  <table>
                    <thead>
                      <tr>
                        <th>Gerente</th>
                        <th>Valor</th>
                        <th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {preview.payments.map((p) => (
                        <tr key={p.id}>
                          <td>{p.participant_name}</td>
                          <td>{fmtMoney(p.final_amount)}</td>
                          <td>
                            <span className={`badge ${p.status === "pago" ? "badge-pago" : "badge-pendente"}`}>
                              {p.status === "pago" ? "Pago" : "Pendente"}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="muted save-report-empty">
                  Nenhum pagamento registrado — serão gerados ao confirmar comissões.
                </p>
              )}
            </div>
          </div>

          <p className="hint save-report-hint">
            Ao confirmar o salvamento, todos os pagamentos pendentes serão marcados como <strong>Pago</strong> e o
            período será fechado.
          </p>

          <label className="full save-report-clients-field">
            Clientes recebidos (marketing)
            <input
              type="number"
              min="0"
              placeholder="Opcional — pode preencher depois no Marketing"
              value={clientsReceived ?? ""}
              onChange={(e) => onClientsReceivedChange?.(e.target.value)}
            />
          </label>

          <div className="form-actions save-report-actions">
            <button type="button" className="btn btn-ghost" disabled={saving} onClick={onClose}>
              Cancelar
            </button>
            <button type="button" className="btn btn-primary" disabled={saving} onClick={onConfirm}>
              {saving ? "Salvando..." : "Confirmar salvamento do relatório"}
            </button>
          </div>
        </>
      ) : (
        <p className="muted">Não foi possível carregar o resumo.</p>
      )}
    </div>
  );
}
