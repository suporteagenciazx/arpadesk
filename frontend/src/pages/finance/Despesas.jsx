import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import api from "../../lib/api";
import Modal from "../../components/Modal";
import DateFilterBar from "../../components/DateFilterBar";
import PeriodHint from "../../components/PeriodHint";
import FinanceTabGuard from "../../components/FinanceTabGuard";
import { ExpenseIcon } from "../../components/Icons";
import { useDateFilter } from "../../hooks/useDateFilter";
import { todayLocalIso } from "../../lib/calendar";
import { EXPENSE_TYPES, fmtMoney, fmtDate } from "../../lib/constants";
import { maskMoney, parseMoney } from "../../lib/masks";

const emptyForm = {
  expense_type: "DIVULGACAO",
  amount: "",
  notes: "",
  expense_date: todayLocalIso(),
};

export default function Despesas() {
  const { projectId } = useParams();
  const [expenses, setExpenses] = useState([]);
  const [project, setProject] = useState(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState("");
  const filter = useDateFilter("atual");

  const load = async (start = filter.periodStart, end = filter.periodEnd) => {
    const params = {};
    if (start) params.period_start = start;
    if (end) params.period_end = end;
    const [e, p] = await Promise.all([
      api.get(`/api/projects/${projectId}/expenses`, { params }),
      api.get(`/api/projects/${projectId}`),
    ]);
    setExpenses(e.data);
    setProject(p.data);
  };

  useEffect(() => {
    load();
  }, [projectId]);

  const types = project?.settings?.expense_types || EXPENSE_TYPES;

  const openCreate = () => {
    setEditing(null);
    setForm({
      ...emptyForm,
      expense_date: todayLocalIso(),
    });
    setError("");
    setModalOpen(true);
  };

  const openEdit = (ex) => {
    setEditing(ex);
    setForm({
      expense_type: ex.expense_type,
      amount: Math.abs(ex.amount),
      notes: ex.notes || "",
      expense_date: ex.expense_date,
    });
    setError("");
    setModalOpen(true);
  };

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    try {
      const payload = {
        ...form,
        amount: parseMoney(form.amount),
      };
      if (editing) {
        await api.patch(`/api/projects/${projectId}/expenses/${editing.id}`, payload);
      } else {
        await api.post(`/api/projects/${projectId}/expenses`, payload);
      }
      setModalOpen(false);
      setEditing(null);
      setForm({
        ...emptyForm,
        expense_date: todayLocalIso(),
      });
      load();
    } catch (err) {
      setError(err.response?.data?.detail || "Erro ao salvar despesa");
    }
  };

  const remove = async (id) => {
    if (!confirm("Excluir esta despesa?")) return;
    try {
      await api.delete(`/api/projects/${projectId}/expenses/${id}`);
      load();
    } catch (err) {
      setError(err.response?.data?.detail || "Erro ao excluir despesa");
    }
  };

  return (
    <FinanceTabGuard tab="despesas">
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

        <div className="toolbar">
          <button type="button" className="btn btn-primary" onClick={openCreate}>
            + Nova despesa
          </button>
        </div>

        {error && <p className="error">{error}</p>}

        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th></th>
                <th>Tipo</th>
                <th>Valor</th>
                <th>Data (fechamento)</th>
                <th>Observações</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {expenses.map((ex) => (
                <tr key={ex.id}>
                  <td>
                    <span className="expense-icon-cell">
                      <ExpenseIcon size={16} />
                    </span>
                  </td>
                  <td>{ex.expense_type}</td>
                  <td className="negative">{fmtMoney(ex.amount)}</td>
                  <td>{fmtDate(ex.expense_date)}</td>
                  <td>{ex.notes || "—"}</td>
                  <td className="actions">
                    <button type="button" className="btn btn-sm btn-ghost" onClick={() => openEdit(ex)}>
                      Editar
                    </button>
                    <button type="button" className="btn btn-sm btn-danger" onClick={() => remove(ex.id)}>
                      Excluir
                    </button>
                  </td>
                </tr>
              ))}
              {expenses.length === 0 && (
                <tr>
                  <td colSpan={6} className="muted center">
                    Nenhuma despesa no período.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <Modal
          open={modalOpen}
          title={editing ? "Editar despesa" : "Nova despesa"}
          onClose={() => setModalOpen(false)}
        >
          <form className="form-grid" onSubmit={submit}>
            {error && <p className="error full">{error}</p>}
            <label>
              Tipo
              <select
                value={form.expense_type}
                onChange={(e) => setForm({ ...form, expense_type: e.target.value })}
              >
                {types.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Valor (positivo ou negativo — sempre contabilizado negativo)
              <input
                inputMode="decimal"
                required
                placeholder="0,00"
                value={form.amount}
                onChange={(e) => setForm({ ...form, amount: maskMoney(e.target.value) })}
              />
            </label>
            <label>
              Data (entrada no relatório / fechamento)
              <input
                type="date"
                value={form.expense_date}
                onChange={(e) => setForm({ ...form, expense_date: e.target.value })}
              />
            </label>
            <label className="full">
              Observações
              <textarea
                rows={3}
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
              />
            </label>
            <div className="form-actions full">
              <button type="button" className="btn btn-ghost" onClick={() => setModalOpen(false)}>
                Cancelar
              </button>
              <button type="submit" className="btn btn-primary">
                Salvar
              </button>
            </div>
          </form>
        </Modal>
      </div>
    </FinanceTabGuard>
  );
}
