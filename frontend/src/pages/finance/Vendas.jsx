import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import api, { postMultipart } from "../../lib/api";
import Modal from "../../components/Modal";
import CashClosingSummary, { fmtDateTime } from "../../components/CashClosingSummary";
import { useAuth } from "../../context/AuthContext";
import { useFinancePeriod } from "../../context/FinancePeriodContext";
import { useCashClosing } from "../../context/CashClosingContext";
import { useToast } from "../../context/ToastContext";
import {
  SALE_VERSIONS,
  SALE_STATUSES,
  KANBAN_COLUMNS,
  fmtMoney,
  fmtDate,
} from "../../lib/constants";
import { formatSaleMemberLabel } from "../../lib/helpers";
import { todayLocalIso } from "../../lib/calendar";
import { canManageDefaultFine, isPeriodLockedForUser } from "../../lib/permissions";
import { canCashClosing } from "../../lib/privileges";
import { FineIcon, FloppyDiskIcon } from "../../components/Icons";
import { maskCnpj, maskPhone, maskMoney, parseMoney, isValidCnpjMasked, isValidPhoneMasked } from "../../lib/masks";

const emptyForm = {
  participant_id: "",
  cnpj: "",
  phone: "",
  sale_version: "V1",
  doc_type: "LAE",
  doc_custom: "",
  amount: "",
  sale_date: todayLocalIso(),
};

const statusLabel = (value) => SALE_STATUSES.find((s) => s.value === value)?.label || value;

export default function Vendas() {
  const { projectId } = useParams();
  const { canChangeSaleStatus, canRegisterSale, user, isAdmin } = useAuth();
  const { notify } = useToast();
  const [sales, setSales] = useState([]);
  const [members, setMembers] = useState([]);
  const [project, setProject] = useState(null);
  const [view, setView] = useState("table");
  const [modalOpen, setModalOpen] = useState(false);
  const [statusConfirm, setStatusConfirm] = useState(null);
  const [detailSale, setDetailSale] = useState(null);
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [adminPassword, setAdminPassword] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [editSaleOpen, setEditSaleOpen] = useState(false);
  const [editForm, setEditForm] = useState(emptyForm);
  const [editAdminPassword, setEditAdminPassword] = useState("");
  const [editCpFile, setEditCpFile] = useState(null);
  const [savingEdit, setSavingEdit] = useState(false);
  const [error, setError] = useState("");
  const [dragId, setDragId] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [cpFile, setCpFile] = useState(null);
  const [hiddenKanbanCols, setHiddenKanbanCols] = useState(() => new Set());
  const [fineModalOpen, setFineModalOpen] = useState(false);
  const [fineParticipantId, setFineParticipantId] = useState("");
  const [fineAmount, setFineAmount] = useState("");
  const [fineNotes, setFineNotes] = useState("");
  const [periodFines, setPeriodFines] = useState([]);
  const [savingFine, setSavingFine] = useState(false);
  const [cashClosingOpen, setCashClosingOpen] = useState(false);
  const [savingClosing, setSavingClosing] = useState(false);
  const [unlocking, setUnlocking] = useState(false);

  const period = useFinancePeriod();
  const {
    closing,
    preview,
    loadPreview,
    submitClosing,
    frozen,
    tabsLocked,
    isCaixaFechado,
    isUnlocked,
    unlockCashClosing,
  } = useCashClosing();

  const weekActive = period.isActionPeriod;
  const canEditSales = weekActive && !tabsLocked && (isAdmin || !frozen);
  const canEditFines = weekActive && !tabsLocked && (isAdmin || !frozen);
  const canChangeStatus =
    weekActive && canChangeSaleStatus && !tabsLocked && (isAdmin || !frozen);
  const canManageFine = canManageDefaultFine(user?.level);
  const periodLocked = isPeriodLockedForUser(user, isAdmin);
  const canUseCashClosing = canCashClosing(user);
  const showFecharCaixa = canUseCashClosing && weekActive && (!closing || isUnlocked) && !tabsLocked;
  const showReabrirCaixa = isAdmin && isCaixaFechado && weekActive && !tabsLocked;

  const lockedTitle = tabsLocked
    ? "Relatório salvo — edite pela aba Arquivo para alterar"
    : frozen
      ? "Caixa fechado"
      : !weekActive
        ? "Disponível apenas no filtro Atual"
        : undefined;

  const openCashClosingModal = async () => {
    setError("");
    try {
      await loadPreview();
      setCashClosingOpen(true);
    } catch (err) {
      setError(err.response?.data?.detail || "Erro ao carregar fechamento");
    }
  };

  const saveCashClosing = async () => {
    setSavingClosing(true);
    setError("");
    try {
      await submitClosing();
      setCashClosingOpen(false);
      notify("Fechamento de caixa registrado.", "success");
    } catch (err) {
      setError(err.response?.data?.detail || "Erro ao salvar fechamento");
    } finally {
      setSavingClosing(false);
    }
  };

  const handleUnlockCaixa = async () => {
    setUnlocking(true);
    setError("");
    try {
      await unlockCashClosing();
      notify("Caixa reaberto — usuários podem voltar a registrar vendas e multas.", "success");
    } catch (err) {
      setError(err.response?.data?.detail || "Erro ao reabrir caixa");
    } finally {
      setUnlocking(false);
    }
  };

  const load = async () => {
    if (period.hasDraft && period.importDraft?.preview?.sales) {
      setSales(period.importDraft.preview.sales);
      const [m, p, finesRes] = await Promise.all([
        api.get(`/api/projects/${projectId}/members`),
        api.get(`/api/projects/${projectId}`),
        api.get(`/api/projects/${projectId}/fines`, { params: period.params() }).catch(() => ({ data: [] })),
      ]);
      setMembers(m.data);
      setProject(p.data);
      setPeriodFines(finesRes.data || []);
      return;
    }
    const params = period.params();
    const [s, m, p, finesRes] = await Promise.all([
      api.get(`/api/projects/${projectId}/sales`, { params }),
      api.get(`/api/projects/${projectId}/members`),
      api.get(`/api/projects/${projectId}`),
      api.get(`/api/projects/${projectId}/fines`, { params }).catch(() => ({ data: [] })),
    ]);
    setSales(s.data);
    setMembers(m.data);
    setProject(p.data);
    setPeriodFines(finesRes.data || []);
  };

  useEffect(() => {
    load().catch((e) => setError(e.response?.data?.detail || "Erro"));
  }, [projectId, period.periodStart, period.periodEnd, period.reloadToken, period.importDraft]);

  const toggleKanbanColumn = (colValue) => {
    setHiddenKanbanCols((prev) => {
      const next = new Set(prev);
      if (next.has(colValue)) next.delete(colValue);
      else next.add(colValue);
      return next;
    });
  };

  const openFineModal = () => {
    setError("");
    setFineParticipantId("");
    setFineAmount("");
    setFineNotes("");
    setFineModalOpen(true);
  };

  const saveFine = async (e) => {
    e.preventDefault();
    if (!fineParticipantId) {
      setError("Selecione quem receberá a multa");
      return;
    }
    const amount = parseMoney(fineAmount);
    if (!amount || amount <= 0) {
      setError("Informe o valor da multa");
      return;
    }
    setSavingFine(true);
    setError("");
    try {
      await api.post(`/api/projects/${projectId}/fines`, {
        participant_id: Number(fineParticipantId),
        period_start: period.periodStart,
        period_end: period.periodEnd,
        amount,
        notes: fineNotes.trim() || null,
      });
      setFineModalOpen(false);
      await load();
    } catch (err) {
      setError(err.response?.data?.detail || "Erro ao salvar multa");
    } finally {
      setSavingFine(false);
    }
  };

  const docTypes = project?.settings?.doc_types || ["LAE", "DVEGO", "DECORE", "LAUDO", "OUTROS"];
  const telegramNotify = Boolean(project?.settings?.telegram_notify_on_ok);

  const openModal = () => {
    setError("");
    setCpFile(null);
    setModalOpen(true);
  };

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    if (form.cnpj && !isValidCnpjMasked(form.cnpj)) {
      setError("CNPJ incompleto. Use o formato 00.000.000/0000-00");
      return;
    }
    if (form.phone && !isValidPhoneMasked(form.phone)) {
      setError("Telefone incompleto. Use o formato (12) 91234-5678");
      return;
    }
    try {
      const hasFile = Boolean(cpFile);
      const { data: sale } = await api.post(
        `/api/projects/${projectId}/sales`,
        {
          ...form,
          participant_id: Number(form.participant_id),
          amount: parseMoney(form.amount),
          cp_attachment_url: null,
        },
        { params: hasFile ? { defer_notify: true } : {} }
      );
      if (hasFile) {
        const fd = new FormData();
        fd.append("file", cpFile);
        await postMultipart(`/api/projects/${projectId}/sales/${sale.id}/attachment`, fd, {
          params: { notify: true },
        });
      }
      setModalOpen(false);
      setCpFile(null);
      setForm({ ...emptyForm, sale_date: todayLocalIso() });
      load();
    } catch (err) {
      setError(err.response?.data?.detail || "Erro ao salvar");
    }
  };

  const requestStatusChange = (saleId, newStatus) => {
    if (!canChangeStatus) return;
    const sale = sales.find((s) => s.id === saleId);
    if (!sale || sale.status === newStatus) return;
    setStatusConfirm({
      saleId,
      saleCode: sale.sale_code,
      from: sale.status,
      to: newStatus,
    });
  };

  const confirmStatusChange = async () => {
    if (!statusConfirm) return;
    const { saleId, to } = statusConfirm;
    setError("");
    try {
      const { data: updated } = await api.patch(`/api/projects/${projectId}/sales/${saleId}`, {
        status: to,
      });
      setStatusConfirm(null);
      setSales((prev) =>
        prev.map((s) => (s.id === saleId ? { ...s, status: updated.status ?? to } : s))
      );
      await load();
    } catch (err) {
      setError(err.response?.data?.detail || "Erro ao atualizar status");
      setStatusConfirm(null);
    }
  };

  const onDrop = async (status) => {
    if (!dragId || !canChangeStatus) return;
    const sale = sales.find((s) => s.id === dragId);
    if (sale && sale.status !== status) {
      requestStatusChange(dragId, status);
    }
    setDragId(null);
  };

  const salesByStatus = (status) => sales.filter((s) => s.status === status);

  const openCpAttachment = async (saleId) => {
    try {
      const { data } = await api.get(
        `/api/projects/${projectId}/sales/${saleId}/attachment/download`,
        { responseType: "blob" }
      );
      const url = URL.createObjectURL(data);
      window.open(url, "_blank", "noopener,noreferrer");
      setTimeout(() => URL.revokeObjectURL(url), 120000);
    } catch (err) {
      setError(err.response?.data?.detail || "Erro ao abrir comprovante");
    }
  };

  const openDeleteConfirm = (sale) => {
    if (!canEditSales) return;
    setError("");
    setAdminPassword("");
    setDeleteConfirm({ saleId: sale.id, saleCode: sale.sale_code });
  };

  const openEditSale = (sale) => {
    if (!canEditSales) return;
    setEditForm({
      participant_id: String(sale.participant_id),
      cnpj: sale.cnpj || "",
      phone: sale.phone || "",
      sale_version: sale.sale_version,
      doc_type: sale.doc_type,
      doc_custom: sale.doc_custom || "",
      amount: String(sale.amount).replace(".", ","),
      sale_date: sale.sale_date,
    });
    setEditAdminPassword("");
    setEditCpFile(null);
    setEditSaleOpen(true);
  };

  const submitEditSale = async (e) => {
    e.preventDefault();
    if (!detailSale) return;
    setError("");
    if (editForm.cnpj && !isValidCnpjMasked(editForm.cnpj)) {
      setError("CNPJ incompleto. Use o formato 00.000.000/0000-00");
      return;
    }
    if (editForm.phone && !isValidPhoneMasked(editForm.phone)) {
      setError("Telefone incompleto. Use o formato (12) 91234-5678");
      return;
    }
    setSavingEdit(true);
    try {
      const { data: updated } = await api.post(
        `/api/projects/${projectId}/sales/${detailSale.id}/admin-update`,
        {
          admin_password: editAdminPassword,
          participant_id: Number(editForm.participant_id),
          cnpj: editForm.cnpj || null,
          phone: editForm.phone || null,
          sale_version: editForm.sale_version,
          doc_type: editForm.doc_type,
          doc_custom: editForm.doc_type === "OUTROS" ? editForm.doc_custom : null,
          amount: parseMoney(editForm.amount),
          sale_date: editForm.sale_date,
        }
      );
      let finalSale = updated;
      if (editCpFile) {
        const fd = new FormData();
        fd.append("file", editCpFile);
        const { data: withAttachment } = await postMultipart(
          `/api/projects/${projectId}/sales/${detailSale.id}/attachment`,
          fd,
          { params: { notify: false } }
        );
        finalSale = withAttachment;
      }
      setEditSaleOpen(false);
      setEditAdminPassword("");
      setEditCpFile(null);
      setDetailSale((prev) => (prev ? { ...prev, ...finalSale } : prev));
      await load();
    } catch (err) {
      setError(err.response?.data?.detail || "Erro ao editar venda");
    } finally {
      setSavingEdit(false);
    }
  };

  const confirmDelete = async (e) => {
    e.preventDefault();
    if (!deleteConfirm) return;
    setError("");
    setDeleting(true);
    try {
      await api.post(`/api/projects/${projectId}/sales/${deleteConfirm.saleId}/delete`, {
        admin_password: adminPassword,
      });
      setDeleteConfirm(null);
      setDetailSale(null);
      setAdminPassword("");
      load();
    } catch (err) {
      setError(err.response?.data?.detail || "Erro ao excluir venda");
    } finally {
      setDeleting(false);
    }
  };

  const docLabel = (s) => (s.doc_type === "OUTROS" ? s.doc_custom || "OUTROS" : s.doc_type);


  const fineTargets = useMemo(
    () => members.filter((m) => m.user_level !== "admin"),
    [members]
  );

  return (
    <div>
      <div className="toolbar toolbar-wrap toolbar-spread">
        <div className="view-toggle">
          <button
            type="button"
            className={`btn btn-sm ${view === "table" ? "btn-primary" : "btn-ghost"}`}
            onClick={() => setView("table")}
          >
            ☰ Tabela
          </button>
          <button
            type="button"
            className={`btn btn-sm ${view === "kanban" ? "btn-primary" : "btn-ghost"}`}
            onClick={() => setView("kanban")}
          >
            ⊞ Kanban
          </button>
        </div>
        <div className="toolbar-actions toolbar-actions--cash">
          {canRegisterSale && (
            <button
              type="button"
              className="btn btn-primary"
              onClick={openModal}
              disabled={!canEditSales}
              title={lockedTitle}
            >
              + Nova venda
            </button>
          )}
          {showFecharCaixa && (
            <button
              type="button"
              className="btn-cash-closing-outline"
              onClick={openCashClosingModal}
              title="Fechar caixa da semana"
            >
              <FloppyDiskIcon size={15} />
              Fechamento de caixa
            </button>
          )}
          {showReabrirCaixa && (
            <div className="cash-closing-reopen-group">
              <button
                type="button"
                className="btn-cash-closing-confirm"
                disabled={unlocking}
                onClick={handleUnlockCaixa}
              >
                <FloppyDiskIcon size={15} />
                {unlocking ? "Reabrindo..." : "Reabrir caixa"}
              </button>
              <span className="cash-closing-closed-meta">
                Fechado por <strong>{closing?.closed_by_name}</strong> em{" "}
                {fmtDateTime(closing?.closed_at)}
              </span>
            </div>
          )}
        </div>
        {canManageFine && (
          <button
            type="button"
            className="btn-fine-outline toolbar-end"
            onClick={openFineModal}
            disabled={!canEditFines}
            title={lockedTitle}
          >
            <FineIcon size={15} />
            Adicionar multa
          </button>
        )}
      </div>

      {error && <p className="error">{error}</p>}

      {periodLocked && (
        <p className="hint">Período fixo na semana atual — habilite o privilégio «Histórico completo» para outros períodos.</p>
      )}

      {period.hasDraft && (
        <p className="hint">Pré-visualização da importação — edição bloqueada até salvar o relatório.</p>
      )}

      {view === "table" ? (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>ID</th>
                <th>Agente</th>
                <th>CNPJ</th>
                <th>Venda</th>
                <th>Valor</th>
                <th>Data</th>
                <th>Status</th>
                <th>Ações</th>
              </tr>
            </thead>
            <tbody>
              {sales.map((s) => (
                <tr key={s.id}>
                  <td>
                    <code>{s.sale_code}</code>
                  </td>
                  <td>{s.participant_name}</td>
                  <td>{s.cnpj || "—"}</td>
                  <td>{s.sale_version}</td>
                  <td>{fmtMoney(s.amount)}</td>
                  <td>{fmtDate(s.sale_date)}</td>
                  <td>
                    {canChangeStatus ? (
                      <select
                        className="select-sm"
                        value={s.status}
                        disabled={!canChangeStatus}
                        onChange={(e) => {
                          const next = e.target.value;
                          if (next !== s.status) requestStatusChange(s.id, next);
                        }}
                      >
                        {SALE_STATUSES.map((st) => (
                          <option key={st.value} value={st.value}>
                            {st.label}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <span className="badge">{statusLabel(s.status)}</span>
                    )}
                  </td>
                  <td>
                    <div className="table-actions">
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm"
                        onClick={() => setDetailSale(s)}
                      >
                        Detalhes
                      </button>
                      <button
                        type="button"
                        className="btn btn-danger btn-sm"
                        disabled={!canEditSales}
                        title={!weekActive ? "Disponível apenas no filtro Atual" : undefined}
                        onClick={() => openDeleteConfirm(s)}
                      >
                        Excluir
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {sales.length === 0 && (
                <tr>
                  <td colSpan={8} className="muted center">
                    Nenhuma venda cadastrada.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      ) : (
        <>
          {hiddenKanbanCols.size > 0 && (
            <div className="kanban-hidden-bar">
              <span className="muted">Colunas ocultas:</span>
              {KANBAN_COLUMNS.filter((c) => hiddenKanbanCols.has(c.value)).map((col) => (
                <button
                  key={col.value}
                  type="button"
                  className="btn btn-sm btn-ghost"
                  onClick={() => toggleKanbanColumn(col.value)}
                  title="Mostrar coluna"
                >
                  👁 {col.label}
                </button>
              ))}
            </div>
          )}
          <div className="kanban-board">
            {KANBAN_COLUMNS.filter((col) => !hiddenKanbanCols.has(col.value)).map((col) => (
              <div
                key={col.value}
                className="kanban-column"
                onDragOver={(e) => canChangeStatus && e.preventDefault()}
                onDrop={() => onDrop(col.value)}
              >
                <div className="kanban-column-header">
                  <span>{col.label}</span>
                  <div className="kanban-header-actions">
                    <span className="kanban-count">{salesByStatus(col.value).length}</span>
                    <button
                      type="button"
                      className="kanban-eye-btn"
                      onClick={() => toggleKanbanColumn(col.value)}
                      title="Ocultar coluna"
                      aria-label={`Ocultar ${col.label}`}
                    >
                      👁
                    </button>
                  </div>
                </div>
              <div className="kanban-cards">
                {salesByStatus(col.value).map((s) => (
                  <div
                    key={s.id}
                    className={`kanban-card ${!canChangeStatus ? "kanban-card-static" : ""}`}
                    draggable={canChangeStatus}
                    onDragStart={() => canChangeStatus && setDragId(s.id)}
                    onDragEnd={() => setDragId(null)}
                  >
                    <div className="kanban-card-top">
                      <code>{s.sale_code}</code>
                      <strong>{fmtMoney(s.amount)}</strong>
                    </div>
                    <p className="kanban-card-agent">{s.participant_name}</p>
                    <p className="kanban-card-meta">
                      {s.sale_version} · {s.doc_type === "OUTROS" ? s.doc_custom : s.doc_type}
                    </p>
                    <p className="kanban-card-date">{fmtDate(s.sale_date)}</p>
                  </div>
                ))}
              </div>
              </div>
            ))}
          </div>
        </>
      )}

      <Modal open={modalOpen} title="Nova venda" onClose={() => setModalOpen(false)} wide>
        <form className="form-grid" onSubmit={submit}>
          <label>
            Gerente / Agente
            <select
              required
              value={form.participant_id}
              onChange={(e) => setForm({ ...form, participant_id: e.target.value })}
            >
              <option value="">Selecione...</option>
              {members
                .filter((m) => m.user_level !== "admin")
                .map((m) => (
                  <option key={m.user_id} value={m.user_id}>
                    {formatSaleMemberLabel(m)}
                  </option>
                ))}
            </select>
          </label>
          <label>
            CNPJ
            <input
              placeholder="00.000.000/0000-00"
              value={form.cnpj}
              onChange={(e) => setForm({ ...form, cnpj: maskCnpj(e.target.value) })}
            />
          </label>
          <label>
            Telefone
            <input
              placeholder="(12) 91234-5678"
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: maskPhone(e.target.value) })}
            />
          </label>
          <label>
            Venda
            <select
              value={form.sale_version}
              onChange={(e) => setForm({ ...form, sale_version: e.target.value })}
            >
              {SALE_VERSIONS.map((v) => (
                <option key={v} value={v}>
                  {v}
                </option>
              ))}
            </select>
          </label>
          <label>
            DOC
            <select
              value={form.doc_type}
              onChange={(e) => setForm({ ...form, doc_type: e.target.value })}
            >
              {docTypes.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
          </label>
          {form.doc_type === "OUTROS" && (
            <label>
              DOC (outros)
              <input
                required
                value={form.doc_custom}
                onChange={(e) => setForm({ ...form, doc_custom: e.target.value })}
              />
            </label>
          )}
          <label>
            Valor (R$)
            <input
              inputMode="decimal"
              required
              placeholder="0,00"
              value={form.amount}
              onChange={(e) => setForm({ ...form, amount: maskMoney(e.target.value) })}
            />
          </label>
          <label>
            Data da venda
            <input
              type="date"
              value={form.sale_date}
              onChange={(e) => setForm({ ...form, sale_date: e.target.value })}
            />
          </label>
          <label className="full">
            Anexar CP <span className="muted">(opcional)</span>
            <input
              type="file"
              accept=".pdf,.jpg,.jpeg,.png,.webp,application/pdf,image/jpeg,image/png,image/webp"
              onChange={(e) => setCpFile(e.target.files?.[0] || null)}
            />
            <span className="hint-inline">
              PDF ou imagem (máx. 10 MB). Nem todas as vendas precisam de comprovante.
            </span>
            {cpFile && <span className="hint-inline">Selecionado: {cpFile.name}</span>}
          </label>
          <p className="hint full">
            ID de 6 dígitos será gerado automaticamente. Status inicial: Pendente.
          </p>
          <div className="form-actions full">
            <button type="button" className="btn btn-ghost" onClick={() => setModalOpen(false)}>
              Cancelar
            </button>
            <button type="submit" className="btn btn-primary">
              Cadastrar
            </button>
          </div>
        </form>
      </Modal>

      <Modal
        open={Boolean(statusConfirm)}
        title="Confirmar alteração de status"
        onClose={() => setStatusConfirm(null)}
      >
        {statusConfirm && (
          <div>
            <p>
              Alterar venda <code>{statusConfirm.saleCode}</code> de{" "}
              <strong>{statusLabel(statusConfirm.from)}</strong> para{" "}
              <strong>{statusLabel(statusConfirm.to)}</strong>?
            </p>
            {statusConfirm.to === "ok" && telegramNotify && (
              <p className="hint">Com o switch ativo, esta venda será enviada ao Telegram configurado.</p>
            )}
            <div className="form-actions">
              <button type="button" className="btn btn-ghost" onClick={() => setStatusConfirm(null)}>
                Cancelar
              </button>
              <button type="button" className="btn btn-primary" onClick={confirmStatusChange}>
                Confirmar
              </button>
            </div>
          </div>
        )}
      </Modal>

      <Modal
        open={Boolean(detailSale)}
        title={detailSale ? `Venda ${detailSale.sale_code}` : "Detalhes"}
        onClose={() => setDetailSale(null)}
      >
        {detailSale && (
          <div>
            <dl className="sale-detail">
              <div>
                <dt>ID</dt>
                <dd>
                  <code>{detailSale.sale_code}</code>
                </dd>
              </div>
              <div>
                <dt>Agente</dt>
                <dd>{detailSale.participant_name}</dd>
              </div>
              <div>
                <dt>CNPJ</dt>
                <dd>{detailSale.cnpj || "—"}</dd>
              </div>
              <div>
                <dt>Telefone</dt>
                <dd>{detailSale.phone || "—"}</dd>
              </div>
              <div>
                <dt>Venda</dt>
                <dd>{detailSale.sale_version}</dd>
              </div>
              <div>
                <dt>DOC</dt>
                <dd>{docLabel(detailSale)}</dd>
              </div>
              <div>
                <dt>Valor</dt>
                <dd>{fmtMoney(detailSale.amount)}</dd>
              </div>
              <div>
                <dt>Data</dt>
                <dd>{fmtDate(detailSale.sale_date)}</dd>
              </div>
              <div>
                <dt>Status</dt>
                <dd>{statusLabel(detailSale.status)}</dd>
              </div>
              {(detailSale.has_cp_attachment || detailSale.cp_attachment_url) && (
                <div className="full">
                  <dt>CP anexado</dt>
                  <dd>
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      onClick={() => openCpAttachment(detailSale.id)}
                    >
                      Ver comprovante
                    </button>
                  </dd>
                </div>
              )}
            </dl>
            <div className="form-actions">
              <button type="button" className="btn btn-ghost" onClick={() => setDetailSale(null)}>
                Fechar
              </button>
              {canEditSales && (
                <button type="button" className="btn btn-primary" onClick={() => openEditSale(detailSale)}>
                  Editar dados da venda
                </button>
              )}
              {canEditSales && (
                <button
                  type="button"
                  className="btn btn-danger"
                  onClick={() => openDeleteConfirm(detailSale)}
                >
                  Excluir
                </button>
              )}
            </div>
          </div>
        )}
      </Modal>

      <Modal
        open={editSaleOpen}
        title={detailSale ? `Editar venda ${detailSale.sale_code}` : "Editar venda"}
        wide
        onClose={() => !savingEdit && setEditSaleOpen(false)}
      >
        <form className="form-grid" onSubmit={submitEditSale}>
          <label>
            Gerente / Agente
            <select
              required
              value={editForm.participant_id}
              onChange={(e) => setEditForm({ ...editForm, participant_id: e.target.value })}
            >
              <option value="">Selecione...</option>
              {members
                .filter((m) => m.user_level !== "admin")
                .map((m) => (
                  <option key={m.user_id} value={m.user_id}>
                    {formatSaleMemberLabel(m)}
                  </option>
                ))}
            </select>
          </label>
          <label>
            CNPJ
            <input
              placeholder="00.000.000/0000-00"
              value={editForm.cnpj}
              onChange={(e) => setEditForm({ ...editForm, cnpj: maskCnpj(e.target.value) })}
            />
          </label>
          <label>
            Telefone
            <input
              placeholder="(12) 91234-5678"
              value={editForm.phone}
              onChange={(e) => setEditForm({ ...editForm, phone: maskPhone(e.target.value) })}
            />
          </label>
          <label>
            Venda
            <select
              value={editForm.sale_version}
              onChange={(e) => setEditForm({ ...editForm, sale_version: e.target.value })}
            >
              {SALE_VERSIONS.map((v) => (
                <option key={v} value={v}>
                  {v}
                </option>
              ))}
            </select>
          </label>
          <label>
            DOC
            <select
              value={editForm.doc_type}
              onChange={(e) => setEditForm({ ...editForm, doc_type: e.target.value })}
            >
              {docTypes.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
          </label>
          {editForm.doc_type === "OUTROS" && (
            <label>
              DOC (outros)
              <input
                value={editForm.doc_custom}
                onChange={(e) => setEditForm({ ...editForm, doc_custom: e.target.value })}
              />
            </label>
          )}
          <label>
            Valor
            <input
              required
              value={editForm.amount}
              onChange={(e) => setEditForm({ ...editForm, amount: maskMoney(e.target.value) })}
            />
          </label>
          <label>
            Data
            <input
              type="date"
              required
              value={editForm.sale_date}
              onChange={(e) => setEditForm({ ...editForm, sale_date: e.target.value })}
            />
          </label>
          <label className="full">
            Comprovante (CP) <span className="muted">(opcional)</span>
            {detailSale?.has_cp_attachment || detailSale?.cp_attachment_url ? (
              <span className="hint-inline">
                Comprovante atual anexado.{" "}
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  onClick={() => openCpAttachment(detailSale.id)}
                >
                  Ver atual
                </button>
              </span>
            ) : (
              <span className="hint-inline">Nenhum comprovante anexado.</span>
            )}
            <input
              type="file"
              accept=".pdf,.jpg,.jpeg,.png,.webp,application/pdf,image/jpeg,image/png,image/webp"
              onChange={(e) => setEditCpFile(e.target.files?.[0] || null)}
            />
            <span className="hint-inline">
              Selecione um arquivo para anexar ou substituir o comprovante (PDF ou imagem, máx. 10 MB).
            </span>
            {editCpFile && <span className="hint-inline">Novo arquivo: {editCpFile.name}</span>}
          </label>
          <label className="full">
            Senha de administrador
            <input
              type="password"
              required
              autoComplete="current-password"
              value={editAdminPassword}
              onChange={(e) => setEditAdminPassword(e.target.value)}
            />
          </label>
          <div className="form-actions full">
            <button
              type="button"
              className="btn btn-ghost"
              disabled={savingEdit}
              onClick={() => setEditSaleOpen(false)}
            >
              Cancelar
            </button>
            <button type="submit" className="btn btn-primary" disabled={savingEdit}>
              {savingEdit ? "Salvando..." : "Salvar alterações"}
            </button>
          </div>
        </form>
      </Modal>

      <Modal
        open={Boolean(deleteConfirm)}
        title="Excluir venda"
        onClose={() => !deleting && setDeleteConfirm(null)}
      >
        {deleteConfirm && (
          <form onSubmit={confirmDelete}>
            <p>
              Tem certeza que deseja excluir a venda <code>{deleteConfirm.saleCode}</code>? Esta ação
              não pode ser desfeita.
            </p>
            <p className="hint">Informe a senha de um administrador para confirmar.</p>
            <label>
              Senha do administrador
              <input
                type="password"
                required
                autoComplete="current-password"
                value={adminPassword}
                onChange={(e) => setAdminPassword(e.target.value)}
              />
            </label>
            <div className="form-actions">
              <button
                type="button"
                className="btn btn-ghost"
                disabled={deleting}
                onClick={() => setDeleteConfirm(null)}
              >
                Cancelar
              </button>
              <button type="submit" className="btn btn-danger" disabled={deleting}>
                {deleting ? "Excluindo..." : "Excluir venda"}
              </button>
            </div>
          </form>
        )}
      </Modal>

      <Modal open={fineModalOpen} title="Adicionar multa" onClose={() => setFineModalOpen(false)}>
        <form onSubmit={saveFine}>
          <p className="hint">
            A multa será aplicada na coluna Multas da aba Pagamentos para o período atual.
          </p>
          <label>
            Gerente (quem receberá a multa)
            <select
              value={fineParticipantId}
              onChange={(e) => setFineParticipantId(e.target.value)}
              required
            >
              <option value="">Selecione...</option>
              {fineTargets.map((m) => (
                <option key={m.user_id} value={m.user_id}>
                  {formatSaleMemberLabel(m)}
                </option>
              ))}
            </select>
          </label>
          <label>
            Valor da multa (R$)
            <input
              inputMode="decimal"
              placeholder="0,00"
              value={fineAmount}
              onChange={(e) => setFineAmount(maskMoney(e.target.value))}
              required
            />
          </label>
          <label className="full">
            Observações
            <textarea
              rows={4}
              placeholder="Motivo, contexto ou quem está cadastrando a multa..."
              value={fineNotes}
              onChange={(e) => setFineNotes(e.target.value)}
            />
          </label>
          <div className="form-actions">
            <button type="button" className="btn btn-ghost" onClick={() => setFineModalOpen(false)}>
              Cancelar
            </button>
            <button type="submit" className="btn btn-primary" disabled={savingFine}>
              {savingFine ? "Salvando..." : "Confirmar multa"}
            </button>
          </div>
        </form>
      </Modal>

      <Modal
        open={cashClosingOpen}
        title="Fechamento de caixa"
        wide
        onClose={() => setCashClosingOpen(false)}
      >
        <div className="cash-closing">
          <p className="hint">
            Período: {period.periodStart} — {period.periodEnd}
            {period.weekInfo?.label ? ` · ${period.weekInfo.label}` : ""}
          </p>
          <CashClosingSummary snapshot={preview} />
          <div className="form-actions">
            <button type="button" className="btn btn-ghost" onClick={() => setCashClosingOpen(false)}>
              Cancelar
            </button>
            <button
              type="button"
              className="btn btn-primary"
              disabled={savingClosing}
              onClick={saveCashClosing}
            >
              {savingClosing ? "Salvando..." : "Salvar fechamento"}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
