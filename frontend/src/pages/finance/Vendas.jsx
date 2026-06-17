import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import api, { postMultipart } from "../../lib/api";
import Modal from "../../components/Modal";
import DateFilterBar from "../../components/DateFilterBar";
import PeriodHint from "../../components/PeriodHint";
import { useAuth } from "../../context/AuthContext";
import { useDateFilter } from "../../hooks/useDateFilter";
import {
  SALE_VERSIONS,
  SALE_STATUSES,
  KANBAN_COLUMNS,
  fmtMoney,
  fmtDate,
} from "../../lib/constants";
import { formatSaleMemberLabel } from "../../lib/helpers";
import { todayLocalIso, isCashClosingAvailable } from "../../lib/calendar";
import {
  canManageDefaultFine,
  canCashClosing,
  isPeriodLockedForUser,
} from "../../lib/permissions";
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

function buildManagerCommissionRows(okSales, members, periodFines) {
  const byParticipant = {};
  okSales.forEach((s) => {
    const id = s.participant_id;
    byParticipant[id] = (byParticipant[id] || 0) + Number(s.amount || 0);
  });

  const finesByUser = {};
  periodFines.forEach((f) => {
    finesByUser[f.participant_id] = (finesByUser[f.participant_id] || 0) + Number(f.amount || 0);
  });

  return members
    .filter((m) => m.user_level === "ilustrativo")
    .map((m) => {
      const billing = byParticipant[m.user_id] || 0;
      const pct = Number(m.commission_percent || 0);
      const commission = (billing * pct) / 100;
      const fine = finesByUser[m.user_id] || 0;
      const net = Math.round((commission - fine) * 100) / 100;
      return {
        key: `i-${m.user_id}`,
        name: m.user_name,
        billing,
        percent: pct,
        commission,
        fine,
        net,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
}

export default function Vendas() {
  const { projectId } = useParams();
  const { canChangeSaleStatus, canRegisterSale, user } = useAuth();
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
  const [error, setError] = useState("");
  const [dragId, setDragId] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [cpFile, setCpFile] = useState(null);
  const filter = useDateFilter("atual");
  const [hiddenKanbanCols, setHiddenKanbanCols] = useState(() => new Set());
  const [fineModalOpen, setFineModalOpen] = useState(false);
  const [fineParticipantId, setFineParticipantId] = useState("");
  const [fineAmount, setFineAmount] = useState("");
  const [fineNotes, setFineNotes] = useState("");
  const [periodFines, setPeriodFines] = useState([]);
  const [savingFine, setSavingFine] = useState(false);
  const [cashClosingOpen, setCashClosingOpen] = useState(false);

  const periodLocked = isPeriodLockedForUser(user?.level);
  const showDateFilters = user?.level === "admin";
  const canManageFine = canManageDefaultFine(user?.level);
  const canUseCashClosing = canCashClosing(user?.level);
  const cashClosingAvailable = isCashClosingAvailable();

  const load = async (start = filter.periodStart, end = filter.periodEnd) => {
    const params = {};
    if (start) params.period_start = start;
    if (end) params.period_end = end;
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
  }, [projectId]);

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
        period_start: filter.periodStart,
        period_end: filter.periodEnd,
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
    setError("");
    try {
      await api.patch(`/api/projects/${projectId}/sales/${statusConfirm.saleId}`, {
        status: statusConfirm.to,
      });
      setStatusConfirm(null);
      load();
    } catch (err) {
      setError(err.response?.data?.detail || "Erro ao atualizar status");
      setStatusConfirm(null);
    }
  };

  const onDrop = async (status) => {
    if (!dragId || !canChangeSaleStatus) return;
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
    setError("");
    setAdminPassword("");
    setDeleteConfirm({ saleId: sale.id, saleCode: sale.sale_code });
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

  const billingTotal = sales.reduce((sum, s) => sum + Number(s.amount || 0), 0);
  const okSales = sales.filter((s) => s.status === "ok");
  const okTotal = okSales.reduce((sum, s) => sum + Number(s.amount || 0), 0);
  const finesTotal = periodFines.reduce((sum, f) => sum + Number(f.amount || 0), 0);
  const commissionRows = useMemo(
    () => buildManagerCommissionRows(okSales, members, periodFines),
    [okSales, members, periodFines]
  );
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
        <div className="toolbar-actions">
          {canRegisterSale && (
            <button type="button" className="btn btn-primary" onClick={openModal}>
              + Nova venda
            </button>
          )}
          {canUseCashClosing && (
            <button
              type="button"
              className="btn-cash-closing-outline"
              disabled={!cashClosingAvailable}
              onClick={() => setCashClosingOpen(true)}
              title={
                cashClosingAvailable
                  ? "Fechamento de caixa da semana"
                  : "Disponível de segunda a sexta até 20h"
              }
            >
              <FloppyDiskIcon size={15} />
              Fechamento de caixa
            </button>
          )}
        </div>
        {canManageFine && (
          <button
            type="button"
            className="btn-fine-outline toolbar-end"
            onClick={openFineModal}
            title="Registrar multa para um gerente no período"
          >
            <FineIcon size={15} />
            Adicionar multa
          </button>
        )}
      </div>

      {error && <p className="error">{error}</p>}

      {showDateFilters ? (
        <>
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
          <PeriodHint
            start={filter.periodStart}
            end={filter.periodEnd}
            preset={filter.preset}
            weekInfo={filter.weekInfo}
          />
        </>
      ) : (
        periodLocked && (
          <PeriodHint
            start={filter.periodStart}
            end={filter.periodEnd}
            preset="atual"
            weekInfo={filter.weekInfo}
          />
        )
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
                    {canChangeSaleStatus ? (
                      <select
                        className="select-sm"
                        value={s.status}
                        onChange={(e) => requestStatusChange(s.id, e.target.value)}
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
                onDragOver={(e) => canChangeSaleStatus && e.preventDefault()}
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
                    className={`kanban-card ${!canChangeSaleStatus ? "kanban-card-static" : ""}`}
                    draggable={canChangeSaleStatus}
                    onDragStart={() => canChangeSaleStatus && setDragId(s.id)}
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
            Anexar CP
            <input
              type="file"
              accept=".pdf,.jpg,.jpeg,.png,.webp,application/pdf,image/jpeg,image/png,image/webp"
              onChange={(e) => setCpFile(e.target.files?.[0] || null)}
            />
            <span className="hint-inline">
              PDF ou imagem (máx. 10 MB). O arquivo fica no MinIO; apenas a referência é salva na venda.
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
              <button
                type="button"
                className="btn btn-danger"
                onClick={() => openDeleteConfirm(detailSale)}
              >
                Excluir
              </button>
            </div>
          </div>
        )}
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
          <PeriodHint
            start={filter.periodStart}
            end={filter.periodEnd}
            preset="atual"
            weekInfo={filter.weekInfo}
          />
          <div className="cash-closing-total">
            <span>FATURAMENTO FINAL:</span>
            <strong>{fmtMoney(billingTotal)}</strong>
          </div>
          <p className="hint cash-closing-meta">
            {sales.length} venda(s) no período · {okSales.length} confirmada(s) (OK): {fmtMoney(okTotal)}
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
            {periodFines.length > 0 ? (
              <>
                <div className="table-wrap cash-closing-table">
                  <table>
                    <thead>
                      <tr>
                        <th>Gerente</th>
                        <th>Qtd.</th>
                        <th>Valor descontado</th>
                      </tr>
                    </thead>
                    <tbody>
                      {periodFines.map((f) => (
                        <tr key={f.id}>
                          <td>{f.participant_name}</td>
                          <td>1</td>
                          <td>{fmtMoney(f.amount)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="cash-closing-fine-total">
                  Total em multas: {fmtMoney(finesTotal)}
                </p>
              </>
            ) : (
              <p className="muted">Nenhuma multa registrada no período.</p>
            )}
          </div>

          <div className="cash-closing-section">
            <h4>Comissões</h4>
            {commissionRows.length > 0 ? (
              <div className="cash-closing-commissions">
                {commissionRows.map((row) => (
                  <div key={row.key} className="cash-closing-commission-row">
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

          <div className="form-actions">
            <button type="button" className="btn btn-primary" onClick={() => setCashClosingOpen(false)}>
              Salvar
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
