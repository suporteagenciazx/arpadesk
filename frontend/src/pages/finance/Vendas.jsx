import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import api from "../../lib/api";
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
import { formatMemberLabel } from "../../lib/helpers";
import { maskCnpj, maskPhone, maskMoney, parseMoney, isValidCnpjMasked, isValidPhoneMasked } from "../../lib/masks";

const emptyForm = {
  participant_id: "",
  cnpj: "",
  phone: "",
  sale_version: "V1",
  doc_type: "LAE",
  doc_custom: "",
  amount: "",
  sale_date: new Date().toISOString().slice(0, 10),
};

const statusLabel = (value) => SALE_STATUSES.find((s) => s.value === value)?.label || value;

export default function Vendas() {
  const { projectId } = useParams();
  const { canChangeSaleStatus, canRegisterSale, user } = useAuth();
  const [sales, setSales] = useState([]);
  const [members, setMembers] = useState([]);
  const [project, setProject] = useState(null);
  const [view, setView] = useState("table");
  const [modalOpen, setModalOpen] = useState(false);
  const [telegramNotify, setTelegramNotify] = useState(false);
  const [statusConfirm, setStatusConfirm] = useState(null);
  const [detailSale, setDetailSale] = useState(null);
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [adminPassword, setAdminPassword] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState("");
  const [dragId, setDragId] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const filter = useDateFilter("atual");
  const [hiddenKanbanCols, setHiddenKanbanCols] = useState(() => new Set());
  const [fineModalOpen, setFineModalOpen] = useState(false);
  const [defaultFinePercent, setDefaultFinePercent] = useState(0);
  const [savingFine, setSavingFine] = useState(false);

  const load = async (start = filter.periodStart, end = filter.periodEnd) => {
    const params = {};
    if (start) params.period_start = start;
    if (end) params.period_end = end;
    const [s, m, p] = await Promise.all([
      api.get(`/api/projects/${projectId}/sales`, { params }),
      api.get(`/api/projects/${projectId}/members`),
      api.get(`/api/projects/${projectId}`),
    ]);
    setSales(s.data);
    setMembers(m.data);
    setProject(p.data);
    setTelegramNotify(Boolean(p.data.settings?.telegram_notify_on_ok));
  };

  useEffect(() => {
    load().catch((e) => setError(e.response?.data?.detail || "Erro"));
    api
      .get(`/api/projects/${projectId}/payment-settings`)
      .then(({ data }) => setDefaultFinePercent(data?.default_fine_percent || 0))
      .catch(() => {});
  }, [projectId]);

  const toggleKanbanColumn = (colValue) => {
    setHiddenKanbanCols((prev) => {
      const next = new Set(prev);
      if (next.has(colValue)) next.delete(colValue);
      else next.add(colValue);
      return next;
    });
  };

  const saveDefaultFine = async (e) => {
    e.preventDefault();
    setSavingFine(true);
    setError("");
    try {
      let existing = null;
      try {
        const res = await api.get(`/api/projects/${projectId}/payment-settings`);
        existing = res.data;
      } catch {
        existing = null;
      }
      await api.put(`/api/projects/${projectId}/payment-settings`, {
        payment_type: existing?.payment_type || "pix",
        pix_key: existing?.pix_key || "",
        pix_qr: existing?.pix_qr || "",
        crypto_address: existing?.crypto_address || "",
        crypto_network: existing?.crypto_network || "",
        crypto_qr: existing?.crypto_qr || "",
        default_fine_percent: Number(defaultFinePercent),
      });
      setFineModalOpen(false);
    } catch (err) {
      setError(err.response?.data?.detail || "Erro ao salvar multa");
    } finally {
      setSavingFine(false);
    }
  };

  const docTypes = project?.settings?.doc_types || ["LAE", "DVEGO", "DECORE", "LAUDO", "OUTROS"];

  const openModal = () => {
    setError("");
    setModalOpen(true);
  };

  const toggleTelegramNotify = async () => {
    const next = !telegramNotify;
    try {
      const { data } = await api.patch(`/api/projects/${projectId}/settings`, {
        telegram_notify_on_ok: next,
      });
      setProject(data);
      setTelegramNotify(next);
    } catch (err) {
      setError(err.response?.data?.detail || "Erro ao salvar preferência do Telegram");
    }
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
      await api.post(`/api/projects/${projectId}/sales`, {
        ...form,
        participant_id: Number(form.participant_id),
        amount: parseMoney(form.amount),
        cp_attachment_url: null,
      });
      setModalOpen(false);
      setForm({ ...emptyForm, sale_date: new Date().toISOString().slice(0, 10) });
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
          {canChangeSaleStatus && (
            <>
              <button
                type="button"
                className={`switch ${telegramNotify ? "on" : ""}`}
                role="switch"
                aria-checked={telegramNotify}
                onClick={toggleTelegramNotify}
                title="Enviar ao Telegram quando status passar para OK"
              >
                <span className="switch-thumb" />
              </button>
              <span className="switch-caption">Notificar Confirmação no Telegram</span>
            </>
          )}
        </div>
        {canChangeSaleStatus && (
          <button
            type="button"
            className="btn btn-ghost toolbar-end"
            onClick={() => setFineModalOpen(true)}
            title="Multa padrão em pagamentos"
          >
            Multa
          </button>
        )}
      </div>

      {!canChangeSaleStatus && user?.level !== "financeiro" && (
        <p className="hint">Como contador, você pode registrar vendas. Apenas o financeiro altera o status.</p>
      )}

      {error && <p className="error">{error}</p>}

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
                    {formatMemberLabel(m)}
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
            <input type="file" disabled className="input-disabled" />
            <span className="hint-inline">
              Upload em breve (S3). O link do arquivo será salvo na venda quando a integração estiver ativa.
            </span>
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
              {detailSale.cp_attachment_url && (
                <div className="full">
                  <dt>CP anexado</dt>
                  <dd>
                    <a href={detailSale.cp_attachment_url} target="_blank" rel="noreferrer">
                      Ver arquivo
                    </a>
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

      <Modal open={fineModalOpen} title="Multa padrão" onClose={() => setFineModalOpen(false)}>
        <form onSubmit={saveDefaultFine}>
          <p className="hint">Percentual aplicado por padrão nos pagamentos de comissão (aba Pagamentos).</p>
          <label>
            Multa padrão (%)
            <input
              type="number"
              step="0.01"
              min="0"
              value={defaultFinePercent}
              onChange={(e) => setDefaultFinePercent(e.target.value)}
            />
          </label>
          <div className="form-actions">
            <button type="button" className="btn btn-ghost" onClick={() => setFineModalOpen(false)}>
              Cancelar
            </button>
            <button type="submit" className="btn btn-primary" disabled={savingFine}>
              {savingFine ? "Salvando..." : "Salvar"}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
