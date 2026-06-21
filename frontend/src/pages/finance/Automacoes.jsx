import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import api from "../../lib/api";
import FinanceTabGuard from "../../components/FinanceTabGuard";
import Modal from "../../components/Modal";
import {
  AutomationIcon,
  ExpenseIcon,
  FineIcon,
  FloppyDiskIcon,
  PencilIcon,
  SaleConfirmationIcon,
  SaleRegistrationIcon,
  TrashIcon,
} from "../../components/Icons";
import { useToast } from "../../context/ToastContext";

const apiError = (err, fallback) => {
  const detail = err?.response?.data?.detail;
  if (Array.isArray(detail)) {
    return detail.map((d) => d.msg || String(d)).join(", ");
  }
  if (typeof detail === "object" && detail !== null) {
    return JSON.stringify(detail);
  }
  return detail || fallback;
};

const AUTOMATION_VAR_FILTERS = {
  sale_registration: ["Geral", "Vendas"],
  sale_confirmation: ["Geral", "Vendas", "Comissões e resumo"],
  cash_closing: ["Geral", "Fechamento de caixa", "Comissões e resumo"],
  goal_reached: ["Geral"],
  payment_paid: ["Geral", "Pagamentos"],
  fine_added: ["Geral", "Multas"],
  expense_changed: ["Geral", "Despesas", "Despesas (ação)"],
};

function automationIcon(key, size = 20) {
  if (key === "sale_registration") return <SaleRegistrationIcon size={size} />;
  if (key === "sale_confirmation") return <SaleConfirmationIcon size={size} />;
  if (key === "cash_closing") return <FloppyDiskIcon size={size} />;
  if (key === "goal_reached") return <AutomationIcon size={size} />;
  if (key === "payment_paid") return <SaleConfirmationIcon size={size} />;
  if (key === "fine_added") return <FineIcon size={size} />;
  if (key === "expense_changed") return <ExpenseIcon size={size} />;
  return <AutomationIcon size={size} />;
}

function VariableChips({ groups, filterGroups, onInsert }) {
  const visible = filterGroups
    ? groups.filter((g) => filterGroups.includes(g.group))
    : groups;

  return (
    <div className="telegram-vars">
      {visible.map((group) => (
        <div key={group.group} className="telegram-var-group">
          <strong>{group.group}</strong>
          <div className="telegram-var-list">
            {group.variables.map((v) => (
              <button
                key={v.key}
                type="button"
                className="var-chip"
                onClick={() => onInsert(v.key)}
                title={v.description}
              >
                {`{{${v.key}}}`}
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function BotSelector({ bots, value, onChange }) {
  const activeBots = bots.filter((b) => b.is_active);
  if (!activeBots.length) {
    return (
      <p className="hint">
        Nenhum bot ativo — configure em <strong>Configurações → Telegram → Conexões</strong>.
      </p>
    );
  }
  return (
    <label className="full">
      Bot para envio
      <select value={value || ""} onChange={(e) => onChange(e.target.value ? Number(e.target.value) : null)}>
        <option value="">Primeiro bot ativo</option>
        {activeBots.map((b) => (
          <option key={b.id} value={b.id}>
            {b.display_name}
            {b.username ? ` (@${b.username})` : ""}
          </option>
        ))}
      </select>
    </label>
  );
}

function ChatPicker({ chats, onSelect }) {
  if (!chats.length) return null;
  return (
    <div className="telegram-chat-list">
      <strong>Conversas recentes do bot</strong>
      <ul>
        {chats.map((c) => (
          <li key={c.id}>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => onSelect(c.id)}>
              Usar {c.id}
            </button>
            <span>
              {c.title} ({c.type})
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

const emptyEditForm = () => ({
  name: "",
  description: "",
  chat_id: "",
  send_mode: "group",
  template: "",
  attach_cp: false,
  bot_id: null,
});

export default function Automacoes() {
  const { projectId } = useParams();
  const { notify } = useToast();
  const [rows, setRows] = useState([]);
  const [bots, setBots] = useState([]);
  const [variableGroups, setVariableGroups] = useState([]);
  const [view, setView] = useState("list");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [togglingId, setTogglingId] = useState(null);
  const [editTarget, setEditTarget] = useState(null);
  const [editForm, setEditForm] = useState(emptyEditForm());
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [discovering, setDiscovering] = useState(false);
  const [discoveredChats, setDiscoveredChats] = useState([]);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const [autoRes, botsRes, varsRes] = await Promise.all([
        api.get(`/api/projects/${projectId}/automations`),
        api.get(`/api/projects/${projectId}/automations/meta/bots`),
        api.get("/api/telegram/variables"),
      ]);
      setRows(autoRes.data || []);
      setBots(botsRes.data?.bots || []);
      setVariableGroups(varsRes.data?.groups || []);
    } catch (err) {
      setError(apiError(err, "Erro ao carregar automações"));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [projectId]);

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((row) =>
      [row.name, row.description, row.automation_key].join(" ").toLowerCase().includes(q)
    );
  }, [rows, search]);

  const toggleEnabled = async (row) => {
    setTogglingId(row.id);
    setError("");
    try {
      const { data } = await api.patch(`/api/projects/${projectId}/automations/${row.id}`, {
        is_enabled: !row.is_enabled,
      });
      setRows((prev) => prev.map((r) => (r.id === data.id ? data : r)));
    } catch (err) {
      setError(apiError(err, "Erro ao atualizar automação"));
    } finally {
      setTogglingId(null);
    }
  };

  const openEdit = (row) => {
    const cfg = row.config || {};
    setEditTarget(row);
    setEditForm({
      name: row.name || "",
      description: row.description || "",
      chat_id: cfg.chat_id || "",
      send_mode: cfg.send_mode || "group",
      template: cfg.template || "",
      attach_cp: Boolean(cfg.attach_cp),
      bot_id: cfg.bot_id || null,
    });
    setDiscoveredChats([]);
    setError("");
  };

  const closeEdit = () => {
    if (saving || testing) return;
    setEditTarget(null);
  };

  const saveEdit = async (e) => {
    e.preventDefault();
    if (!editTarget) return;
    setSaving(true);
    setError("");
    try {
      const { data } = await api.patch(`/api/projects/${projectId}/automations/${editTarget.id}`, {
        name: editForm.name.trim(),
        description: editForm.description.trim(),
        config: {
          chat_id: editForm.chat_id,
          send_mode: editForm.send_mode,
          template: editForm.template,
          attach_cp: editForm.attach_cp,
          bot_id: editForm.bot_id,
        },
      });
      setRows((prev) => prev.map((r) => (r.id === data.id ? data : r)));
      setEditTarget(null);
      notify("Automação salva.", "success");
    } catch (err) {
      setError(apiError(err, "Erro ao salvar automação"));
    } finally {
      setSaving(false);
    }
  };

  const testEdit = async () => {
    if (!editTarget) return;
    setTesting(true);
    setError("");
    try {
      const { data } = await api.post(
        `/api/projects/${projectId}/automations/${editTarget.id}/test`,
        {
          chat_id: editForm.chat_id,
          template: editForm.template,
          bot_id: editForm.bot_id,
        }
      );
      notify(data.message, "success");
      if (editForm.chat_id.startsWith("-") && !editForm.chat_id.startsWith("-100")) {
        setEditForm((f) => ({ ...f, chat_id: `-100${f.chat_id.slice(1)}` }));
      }
    } catch (err) {
      setError(apiError(err, "Falha no teste"));
    } finally {
      setTesting(false);
    }
  };

  const discoverChats = async () => {
    setDiscovering(true);
    setError("");
    try {
      const { data } = await api.get("/api/telegram/chats", {
        params: editForm.bot_id ? { bot_id: editForm.bot_id } : {},
      });
      setDiscoveredChats(data.chats || []);
    } catch (err) {
      setError(apiError(err, "Erro ao listar conversas"));
    } finally {
      setDiscovering(false);
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    setError("");
    try {
      await api.delete(`/api/projects/${projectId}/automations/${deleteTarget.id}`);
      setRows((prev) => prev.filter((r) => r.id !== deleteTarget.id));
      setDeleteTarget(null);
      notify("Automação excluída.", "success");
    } catch (err) {
      setError(apiError(err, "Erro ao excluir"));
    } finally {
      setDeleting(false);
    }
  };

  const varFilter = AUTOMATION_VAR_FILTERS[editTarget?.automation_key] || ["Geral"];

  const actionButtons = (row) => (
    <div className="automation-row-actions">
      <button
        type="button"
        className="btn-icon project-action-btn"
        title="Editar automação"
        aria-label="Editar automação"
        onClick={() => openEdit(row)}
      >
        <PencilIcon size={15} />
      </button>
      <button
        type="button"
        className="btn-icon project-action-btn project-action-btn--danger"
        title="Excluir automação"
        aria-label="Excluir automação"
        onClick={() => setDeleteTarget(row)}
      >
        <TrashIcon size={15} />
      </button>
    </div>
  );

  const switchControl = (row) => (
    <button
      type="button"
      className={`switch ${row.is_enabled ? "on" : ""}`}
      role="switch"
      aria-checked={row.is_enabled}
      aria-label={row.is_enabled ? "Desativar automação" : "Ativar automação"}
      disabled={togglingId === row.id}
      onClick={() => toggleEnabled(row)}
    >
      <span className="switch-thumb" />
    </button>
  );

  return (
    <FinanceTabGuard tab="automacoes">
      <div>
        <div className="page-header archive-header">
          <div>
            <h3 className="section-title archive-header-title">
              <AutomationIcon size={22} className="archive-title-icon" />
              Automações
            </h3>
            <p className="hint">Notificações e integrações automáticas deste projeto.</p>
          </div>
          <div className="view-toggle">
            <button
              type="button"
              className={`btn btn-sm ${view === "list" ? "btn-primary" : "btn-ghost"}`}
              onClick={() => setView("list")}
            >
              ☰ Lista
            </button>
            <button
              type="button"
              className={`btn btn-sm ${view === "gallery" ? "btn-primary" : "btn-ghost"}`}
              onClick={() => setView("gallery")}
            >
              ⊞ Galeria
            </button>
          </div>
        </div>

        <div className="archive-toolbar">
          <label className="archive-search">
            <span className="sr-only">Pesquisar automações</span>
            <input
              type="search"
              placeholder="Pesquisar por nome ou descrição..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </label>
        </div>

        {error && <p className="error">{error}</p>}

        {loading ? (
          <p className="muted">Carregando automações...</p>
        ) : view === "gallery" ? (
          <div className="automation-gallery">
            {filteredRows.map((row) => (
              <article
                key={row.id}
                className={`automation-card card${row.is_enabled ? "" : " automation-card--inactive"}`}
              >
                <div className="automation-card-top">
                  <span className="automation-card-icon">{automationIcon(row.automation_key, 22)}</span>
                  {actionButtons(row)}
                </div>
                <strong className="automation-card-name">{row.name}</strong>
                <p className="automation-card-desc muted">{row.description || "—"}</p>
                <div className="automation-card-footer">
                  <span className={`automation-status ${row.is_enabled ? "is-active" : ""}`}>
                    {row.is_enabled ? "Ativa" : "Inativa"}
                  </span>
                  {switchControl(row)}
                </div>
              </article>
            ))}
            {filteredRows.length === 0 && (
              <div className="empty-state card automation-gallery-empty">
                <p>Nenhuma automação encontrada.</p>
              </div>
            )}
          </div>
        ) : (
          <div className="table-wrap">
            <table className="automation-table">
              <thead>
                <tr>
                  <th className="automation-col-icon" aria-label="Tipo" />
                  <th>Nome</th>
                  <th>Descrição</th>
                  <th>Ativa</th>
                  <th className="automation-col-actions">Ações</th>
                </tr>
              </thead>
              <tbody>
                {filteredRows.map((row) => (
                  <tr key={row.id} className={row.is_enabled ? "" : "automation-row--inactive"}>
                    <td className="automation-icon-cell">{automationIcon(row.automation_key)}</td>
                    <td>
                      <strong>{row.name}</strong>
                    </td>
                    <td className="automation-desc-cell">{row.description || "—"}</td>
                    <td>{switchControl(row)}</td>
                    <td>{actionButtons(row)}</td>
                  </tr>
                ))}
                {filteredRows.length === 0 && (
                  <tr>
                    <td colSpan={5} className="muted center">
                      Nenhuma automação encontrada.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}

        <Modal open={Boolean(editTarget)} title={editTarget ? `Editar — ${editTarget.name}` : "Editar"} onClose={closeEdit}>
          {editTarget && (
            <form onSubmit={saveEdit}>
              <div className="form-grid">
                <label>
                  Nome
                  <input
                    required
                    value={editForm.name}
                    onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                  />
                </label>
                <label className="full">
                  Descrição
                  <textarea
                    rows={2}
                    value={editForm.description}
                    onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
                  />
                </label>
              </div>

              <div className="settings-row" style={{ margin: "1rem 0" }}>
                <div>
                  <strong>Enviar comprovante (CP) anexo</strong>
                  <p className="hint-inline">Quando a venda tiver CP, envia o arquivo junto com a mensagem.</p>
                </div>
                <button
                  type="button"
                  className={`switch ${editForm.attach_cp ? "on" : ""}`}
                  role="switch"
                  aria-checked={editForm.attach_cp}
                  onClick={() => setEditForm({ ...editForm, attach_cp: !editForm.attach_cp })}
                >
                  <span className="switch-thumb" />
                </button>
              </div>

              <BotSelector
                bots={bots}
                value={editForm.bot_id}
                onChange={(botId) => setEditForm({ ...editForm, bot_id: botId })}
              />

              <div className="form-grid" style={{ marginTop: "1rem" }}>
                <label>
                  Destino (grupo / canal / usuário)
                  <input
                    placeholder="-1001234567890"
                    value={editForm.chat_id}
                    onChange={(e) => setEditForm({ ...editForm, chat_id: e.target.value })}
                    required
                  />
                </label>
                <label>
                  Tipo de destino
                  <select
                    value={editForm.send_mode}
                    onChange={(e) => setEditForm({ ...editForm, send_mode: e.target.value })}
                  >
                    <option value="group">Grupo</option>
                    <option value="channel">Canal</option>
                    <option value="user">Usuário específico</option>
                  </select>
                </label>
              </div>

              <label className="full" style={{ marginTop: "1rem" }}>
                Mensagem
                <textarea
                  rows={5}
                  value={editForm.template}
                  onChange={(e) => setEditForm({ ...editForm, template: e.target.value })}
                />
              </label>
              <VariableChips
                groups={variableGroups}
                filterGroups={varFilter}
                onInsert={(key) =>
                  setEditForm((f) => ({ ...f, template: `${f.template}{{${key}}}` }))
                }
              />

              <div className="form-actions">
                <button type="button" className="btn btn-ghost" onClick={closeEdit} disabled={saving}>
                  Cancelar
                </button>
                <button type="button" className="btn btn-ghost" onClick={discoverChats} disabled={discovering}>
                  {discovering ? "Buscando..." : "Listar conversas"}
                </button>
                <button type="button" className="btn btn-ghost" onClick={testEdit} disabled={testing}>
                  {testing ? "Enviando..." : "Testar"}
                </button>
                <button type="submit" className="btn btn-primary" disabled={saving}>
                  {saving ? "Salvando..." : "Salvar"}
                </button>
              </div>
              <ChatPicker
                chats={discoveredChats}
                onSelect={(id) => setEditForm((f) => ({ ...f, chat_id: id }))}
              />
            </form>
          )}
        </Modal>

        <Modal
          open={Boolean(deleteTarget)}
          title="Excluir automação"
          onClose={() => !deleting && setDeleteTarget(null)}
        >
          {deleteTarget && (
            <div>
              <p>
                Remover a automação <strong>{deleteTarget.name}</strong>? As notificações deste fluxo deixarão de
                funcionar até que uma nova automação seja configurada.
              </p>
              <div className="form-actions">
                <button
                  type="button"
                  className="btn btn-ghost"
                  disabled={deleting}
                  onClick={() => setDeleteTarget(null)}
                >
                  Cancelar
                </button>
                <button type="button" className="btn btn-danger" disabled={deleting} onClick={confirmDelete}>
                  {deleting ? "Excluindo..." : "Excluir"}
                </button>
              </div>
            </div>
          )}
        </Modal>
      </div>
    </FinanceTabGuard>
  );
}
