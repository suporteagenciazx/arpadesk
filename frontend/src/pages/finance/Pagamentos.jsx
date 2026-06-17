import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import api from "../../lib/api";
import Modal from "../../components/Modal";
import DateFilterBar from "../../components/DateFilterBar";
import PeriodHint from "../../components/PeriodHint";
import FinanceTabGuard from "../../components/FinanceTabGuard";
import { UserIcon } from "../../components/Icons";
import { useDateFilter } from "../../hooks/useDateFilter";
import { fmtMoney } from "../../lib/constants";
import { maskMoney, parseMoney } from "../../lib/masks";

function calcFinal(base, adjustment, applyFine, fineAmount) {
  const fine = applyFine ? Math.round((parseFloat(fineAmount) || 0) * 100) / 100 : 0;
  const final = Math.round((base + adjustment - fine) * 100) / 100;
  return { fine, final };
}

const emptyDraft = () => ({
  adjustment: null,
  adjustment_notes: "",
  apply_fine: false,
  fine_amount: null,
  fine_notes: "",
});

export default function Pagamentos() {
  const { projectId } = useParams();
  const [summary, setSummary] = useState(null);
  const [payments, setPayments] = useState([]);
  const [hasPaymentSettings, setHasPaymentSettings] = useState(false);
  const [defaultFineAmount, setDefaultFineAmount] = useState(0);
  const [defaultFineNotes, setDefaultFineNotes] = useState("");
  const filter = useDateFilter("atual");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [rowDraft, setRowDraft] = useState({});
  const [confirmPay, setConfirmPay] = useState(null);
  const [editField, setEditField] = useState(null);
  const [confirming, setConfirming] = useState(false);
  const [settings, setSettings] = useState({
    payment_type: "pix",
    pix_key: "",
    pix_qr: "",
    crypto_address: "",
    crypto_network: "",
    crypto_qr: "",
    default_fine_percent: 0,
    default_fine_amount: 0,
    default_fine_notes: "",
  });

  const periodParams = (start = filter.periodStart, end = filter.periodEnd) => {
    const params = {};
    if (start) params.period_start = start;
    if (end) params.period_end = end;
    return params;
  };

  const load = async (start = filter.periodStart, end = filter.periodEnd) => {
    const params = periodParams(start, end);
    const [summaryRes, paymentsRes, psRes, finesRes] = await Promise.all([
      api.get(`/api/projects/${projectId}/payments/commissions`, { params }),
      api.get(`/api/projects/${projectId}/payments`, { params }).catch(() => ({ data: [] })),
      api.get(`/api/projects/${projectId}/payment-settings`).catch(() => ({ data: null })),
      api.get(`/api/projects/${projectId}/fines`, { params }).catch(() => ({ data: [] })),
    ]);
    setSummary({ commissions: summaryRes.data.commissions || [] });
    setPayments(paymentsRes.data || []);
    const ps = psRes.data;
    setHasPaymentSettings(Boolean(ps?.pix_key || ps?.crypto_address));
    if (ps) {
      setSettings((prev) => ({ ...prev, ...ps }));
      setDefaultFineAmount(ps.default_fine_amount || 0);
      setDefaultFineNotes(ps.default_fine_notes || "");
    }
    const fines = finesRes.data || [];
    setRowDraft((prev) => {
      const drafts = {};
      (summaryRes.data?.commissions || []).forEach((c) => {
        drafts[c.user_id] = prev[c.user_id] || emptyDraft();
      });
      fines.forEach((f) => {
        drafts[f.participant_id] = {
          ...(drafts[f.participant_id] || emptyDraft()),
          apply_fine: true,
          fine_amount: f.amount,
          fine_notes: f.notes || "",
        };
      });
      return drafts;
    });
  };

  useEffect(() => {
    load();
  }, [projectId]);

  const saveSettings = async (e) => {
    e.preventDefault();
    await api.put(`/api/projects/${projectId}/payment-settings`, settings);
    setSettingsOpen(false);
    load();
  };

  const updateDraft = (userId, patch) => {
    setRowDraft((d) => ({
      ...d,
      [userId]: { ...(d[userId] || emptyDraft()), ...patch },
    }));
  };

  const rows = useMemo(
    () => (summary?.commissions || []).filter((c) => c.commission_amount > 0),
    [summary]
  );

  const paidByUser = useMemo(() => {
    const map = new Map();
    payments
      .filter(
        (p) =>
          p.status === "pago" &&
          p.period_start === filter.periodStart &&
          p.period_end === filter.periodEnd
      )
      .forEach((p) => map.set(p.participant_id, p));
    return map;
  }, [payments, filter.periodStart, filter.periodEnd]);

  const rowFinal = (c) => {
    const draft = rowDraft[c.user_id] || emptyDraft();
    const paid = paidByUser.get(c.user_id);
    if (paid) return paid.final_amount;
    const adjustment = draft.adjustment ?? 0;
    const fineAmt = draft.apply_fine ? draft.fine_amount ?? defaultFineAmount : 0;
    return calcFinal(c.commission_amount, adjustment, draft.apply_fine, fineAmt).final;
  };

  const totalToPay = useMemo(() => {
    return rows.reduce((sum, c) => {
      if (paidByUser.has(c.user_id)) return sum;
      return sum + rowFinal(c);
    }, 0);
  }, [rows, rowDraft, paidByUser, defaultFineAmount]);

  const openConfirm = (c) => {
    if (!hasPaymentSettings) {
      alert("Configure o destino de pagamento (PIX ou Cripto) antes de confirmar.");
      setSettingsOpen(true);
      return;
    }
    const draft = rowDraft[c.user_id] || emptyDraft();
    const adjustment = draft.adjustment ?? 0;
    const applyFine = Boolean(draft.apply_fine);
    const fineAmt = applyFine ? draft.fine_amount ?? defaultFineAmount : 0;
    const { fine, final } = calcFinal(c.commission_amount, adjustment, applyFine, fineAmt);
    setConfirmPay({
      user_id: c.user_id,
      user_name: c.user_name,
      base_amount: c.commission_amount,
      adjustment,
      adjustment_notes: draft.adjustment_notes,
      apply_fine: applyFine,
      fine_amount: fine,
      fine_notes: draft.fine_notes,
      final_amount: final,
    });
  };

  const confirmPayment = async () => {
    if (!confirmPay) return;
    setConfirming(true);
    try {
      const noteParts = [];
      if (confirmPay.adjustment_notes?.trim()) {
        noteParts.push(`Ajuste: ${confirmPay.adjustment_notes.trim()}`);
      }
      if (confirmPay.fine_notes?.trim()) {
        noteParts.push(`Multa: ${confirmPay.fine_notes.trim()}`);
      }
      const { data: payment } = await api.post(`/api/projects/${projectId}/payments`, {
        participant_id: confirmPay.user_id,
        base_amount: confirmPay.base_amount,
        adjustment_amount: confirmPay.adjustment,
        apply_fine: confirmPay.apply_fine,
        fine_amount: confirmPay.apply_fine ? confirmPay.fine_amount : undefined,
        period_start: filter.periodStart || null,
        period_end: filter.periodEnd || null,
        notes: noteParts.length ? noteParts.join("\n") : undefined,
      });
      await api.patch(`/api/projects/${projectId}/payments/${payment.id}/mark-paid`);
      setConfirmPay(null);
      load();
    } catch (err) {
      alert(err.response?.data?.detail || "Erro ao confirmar pagamento");
    } finally {
      setConfirming(false);
    }
  };

  const saveEditField = async (e) => {
    e.preventDefault();
    if (!editField) return;
    const form = new FormData(e.target);
    if (editField.field === "adjustment") {
      const raw = form.get("adjustment");
      updateDraft(editField.userId, {
        adjustment: raw === "" || raw === null ? null : parseFloat(raw),
        adjustment_notes: String(form.get("adjustment_notes") || ""),
      });
    } else {
      const rawAmount = form.get("fine_amount");
      const amount =
        rawAmount === "" || rawAmount === null
          ? defaultFineAmount
          : parseMoney(String(rawAmount));
      const notes = String(form.get("fine_notes") || "");
      updateDraft(editField.userId, {
        apply_fine: true,
        fine_amount: amount,
        fine_notes: notes,
      });
      if (filter.periodStart && filter.periodEnd && amount > 0) {
        try {
          await api.post(`/api/projects/${projectId}/fines`, {
            participant_id: editField.userId,
            period_start: filter.periodStart,
            period_end: filter.periodEnd,
            amount,
            notes: notes || null,
          });
        } catch (err) {
          alert(err.response?.data?.detail || "Erro ao salvar multa");
        }
      }
    }
    setEditField(null);
  };

  return (
    <FinanceTabGuard tab="pagamentos">
      <div>
        <div className="date-filter-row">
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
          {summary && (
            <div className="payment-total-card">
              <span>Total a pagar no período</span>
              <strong>{fmtMoney(totalToPay)}</strong>
            </div>
          )}
        </div>

        <PeriodHint start={filter.periodStart} end={filter.periodEnd} preset={filter.preset} weekInfo={filter.weekInfo} />

        {!hasPaymentSettings && (
          <div className="alert">
            Configure o destino de pagamento antes de confirmar o primeiro pagamento.
          </div>
        )}

        {!summary ? (
          <p className="muted">Carregando...</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Gerente</th>
                  <th>Comissão</th>
                  <th>Ajuste</th>
                  <th>Multa</th>
                  <th>Valor final</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((c) => {
                  const draft = rowDraft[c.user_id] || emptyDraft();
                  const paid = paidByUser.get(c.user_id);
                  const hasAdjustment = draft.adjustment !== null && draft.adjustment !== undefined;
                  const hasFine = Boolean(draft.apply_fine);

                  return (
                    <tr key={c.user_id}>
                      <td>
                        <span className="user-cell">
                          <span className="user-avatar-icon">
                            <UserIcon size={16} />
                          </span>
                          {c.user_name}
                        </span>
                      </td>
                      <td>{fmtMoney(c.commission_amount)}</td>
                      <td>
                        {paid ? (
                          fmtMoney(paid.adjustment_amount || 0)
                        ) : hasAdjustment ? (
                          <span>
                            {fmtMoney(draft.adjustment)}{" "}
                            <button
                              type="button"
                              className="btn btn-ghost btn-sm"
                              onClick={() =>
                                setEditField({ userId: c.user_id, field: "adjustment", name: c.user_name })
                              }
                            >
                              Alterar
                            </button>
                          </span>
                        ) : (
                          <button
                            type="button"
                            className="btn btn-ghost btn-sm"
                            onClick={() =>
                              setEditField({ userId: c.user_id, field: "adjustment", name: c.user_name })
                            }
                          >
                            Adicionar
                          </button>
                        )}
                      </td>
                      <td>
                        {paid ? (
                          paid.apply_fine ? fmtMoney(paid.fine_amount) : "—"
                        ) : hasFine ? (
                          <span>
                            {fmtMoney(draft.fine_amount ?? defaultFineAmount)}{" "}
                            <button
                              type="button"
                              className="btn btn-ghost btn-sm"
                              onClick={() =>
                                setEditField({ userId: c.user_id, field: "fine", name: c.user_name })
                              }
                            >
                              Alterar
                            </button>
                          </span>
                        ) : (
                          <button
                            type="button"
                            className="btn btn-ghost btn-sm"
                            onClick={() =>
                              setEditField({ userId: c.user_id, field: "fine", name: c.user_name })
                            }
                          >
                            Adicionar
                          </button>
                        )}
                      </td>
                      <td>
                        <strong>{fmtMoney(rowFinal(c))}</strong>
                      </td>
                      <td>
                        {paid ? (
                          <span className="badge badge-pago">Pago</span>
                        ) : (
                          <button
                            type="button"
                            className="btn btn-sm btn-primary"
                            onClick={() => openConfirm(c)}
                          >
                            Confirmar pagamento
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
                {rows.length === 0 && (
                  <tr>
                    <td colSpan={6} className="muted center">
                      Nenhuma comissão no período.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}

        <Modal open={settingsOpen} title="Destino de pagamento" onClose={() => setSettingsOpen(false)} wide>
          <form className="form-grid" onSubmit={saveSettings}>
            <label className="full">
              Tipo
              <select
                value={settings.payment_type}
                onChange={(e) => setSettings({ ...settings, payment_type: e.target.value })}
              >
                <option value="pix">PIX</option>
                <option value="crypto">Cripto</option>
              </select>
            </label>
            {settings.payment_type === "pix" ? (
              <label>
                Chave PIX
                <input
                  required
                  value={settings.pix_key}
                  onChange={(e) => setSettings({ ...settings, pix_key: e.target.value })}
                />
              </label>
            ) : (
              <>
                <label>
                  Rede
                  <input
                    required
                    value={settings.crypto_network || ""}
                    onChange={(e) => setSettings({ ...settings, crypto_network: e.target.value })}
                  />
                </label>
                <label>
                  Endereço
                  <input
                    required
                    value={settings.crypto_address || ""}
                    onChange={(e) => setSettings({ ...settings, crypto_address: e.target.value })}
                  />
                </label>
              </>
            )}
            <div className="form-actions full">
              <button type="submit" className="btn btn-primary">
                Salvar
              </button>
            </div>
          </form>
        </Modal>

        <Modal
          open={Boolean(editField)}
          title={editField?.field === "adjustment" ? "Ajuste" : "Multa"}
          onClose={() => setEditField(null)}
        >
          {editField && (
            <form onSubmit={saveEditField}>
              <p className="hint">
                Gerente: <strong>{editField.name}</strong>
              </p>
              {editField.field === "adjustment" ? (
                <>
                  <label>
                    Valor do ajuste (negativo desconta, positivo adiciona)
                    <input
                      type="number"
                      step="0.01"
                      name="adjustment"
                      defaultValue={rowDraft[editField.userId]?.adjustment ?? ""}
                      placeholder="0,00"
                    />
                  </label>
                  <label className="full">
                    Motivo do ajuste
                    <textarea
                      rows={3}
                      name="adjustment_notes"
                      defaultValue={rowDraft[editField.userId]?.adjustment_notes || ""}
                      placeholder="Descreva o motivo do ajuste..."
                    />
                  </label>
                </>
              ) : (
                <>
                  <label>
                    Valor da multa (R$)
                    <input
                      name="fine_amount"
                      inputMode="decimal"
                      defaultValue={
                        rowDraft[editField.userId]?.fine_amount != null
                          ? String(rowDraft[editField.userId].fine_amount).replace(".", ",")
                          : defaultFineAmount
                            ? String(defaultFineAmount).replace(".", ",")
                            : ""
                      }
                      placeholder="0,00"
                    />
                  </label>
                  <label className="full">
                    Observações
                    <textarea
                      rows={4}
                      name="fine_notes"
                      defaultValue={
                        rowDraft[editField.userId]?.fine_notes ||
                        defaultFineNotes ||
                        ""
                      }
                      placeholder="Motivo, contexto ou quem está cadastrando a multa..."
                    />
                  </label>
                </>
              )}
              <div className="form-actions">
                <button type="button" className="btn btn-ghost" onClick={() => setEditField(null)}>
                  Cancelar
                </button>
                <button type="submit" className="btn btn-primary">
                  Salvar
                </button>
              </div>
            </form>
          )}
        </Modal>

        <Modal
          open={Boolean(confirmPay)}
          title="Confirmar pagamento"
          onClose={() => !confirming && setConfirmPay(null)}
        >
          {confirmPay && (
            <div>
              <p>
                Confirmar pagamento para <strong>{confirmPay.user_name}</strong>?
              </p>
              <ul className="confirm-pay-list">
                <li>Comissão: {fmtMoney(confirmPay.base_amount)}</li>
                <li>Ajuste: {fmtMoney(confirmPay.adjustment)}</li>
                <li>Multa: {confirmPay.apply_fine ? fmtMoney(confirmPay.fine_amount) : "—"}</li>
                <li>
                  <strong>Valor final: {fmtMoney(confirmPay.final_amount)}</strong>
                </li>
              </ul>
              <div className="form-actions">
                <button
                  type="button"
                  className="btn btn-ghost"
                  disabled={confirming}
                  onClick={() => setConfirmPay(null)}
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  className="btn btn-primary"
                  disabled={confirming}
                  onClick={confirmPayment}
                >
                  {confirming ? "Processando..." : "Confirmar"}
                </button>
              </div>
            </div>
          )}
        </Modal>
      </div>
    </FinanceTabGuard>
  );
}
