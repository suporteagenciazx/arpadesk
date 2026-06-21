import { useEffect, useState } from "react";
import api from "../../lib/api";
import Modal from "../../components/Modal";
import { PencilIcon, TrashIcon } from "../../components/Icons";

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

function BotConnectionCard({ bot, onEdit, onDelete, onToggleActive, toggling }) {
  const handle = bot.username ? `@${bot.username}` : "sem @";
  return (
    <div className={`project-card telegram-connection-card${bot.is_active ? "" : " telegram-connection-card--inactive"}`}>
      <div className="project-card-actions">
        <button
          type="button"
          className="btn-icon project-action-btn"
          title="Editar bot"
          aria-label="Editar bot"
          onClick={() => onEdit(bot)}
        >
          <PencilIcon size={16} />
        </button>
        <button
          type="button"
          className="btn-icon project-action-btn project-action-btn--danger"
          title="Excluir bot"
          aria-label="Excluir bot"
          onClick={() => onDelete(bot)}
        >
          <TrashIcon size={16} />
        </button>
      </div>
      <div className="project-card-open telegram-connection-card-body">
        <div className="project-card-icon telegram-connection-avatar">
          {bot.avatar_url ? (
            <img src={bot.avatar_url} alt="" />
          ) : (
            <span>{(bot.display_name || "B").charAt(0).toUpperCase()}</span>
          )}
        </div>
        <strong>{bot.display_name}</strong>
        <span className="muted">{handle}</span>
      </div>
      <div className="telegram-connection-card-footer">
        <span className={`telegram-bot-status ${bot.is_active ? "is-active" : ""}`}>
          {bot.is_active ? "Ativo" : "Inativo"}
        </span>
        <button
          type="button"
          className={`switch ${bot.is_active ? "on" : ""}`}
          role="switch"
          aria-checked={bot.is_active}
          aria-label={bot.is_active ? "Desativar bot" : "Ativar bot"}
          disabled={toggling}
          onClick={() => onToggleActive(bot)}
        >
          <span className="switch-thumb" />
        </button>
      </div>
    </div>
  );
}

export default function Telegram() {
  const [bots, setBots] = useState([]);
  const [botForm, setBotForm] = useState({ display_name: "", username: "", bot_token: "" });
  const [botModalOpen, setBotModalOpen] = useState(false);
  const [editingBot, setEditingBot] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [togglingBotId, setTogglingBotId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [error, setError] = useState("");

  const clearMessages = () => {
    setFeedback("");
    setError("");
  };

  const loadBots = () =>
    api.get("/api/telegram/bots").then(({ data }) => {
      setBots(data || []);
    });

  useEffect(() => {
    loadBots()
      .catch((e) => setError(apiError(e, "Erro ao carregar")))
      .finally(() => setLoading(false));
  }, []);

  const openAddBot = () => {
    setEditingBot(null);
    setBotForm({ display_name: "", username: "", bot_token: "" });
    clearMessages();
    setBotModalOpen(true);
  };

  const openEditBot = (bot) => {
    setEditingBot(bot);
    setBotForm({
      display_name: bot.display_name || "",
      username: bot.username || "",
      bot_token: "",
    });
    clearMessages();
    setBotModalOpen(true);
  };

  const closeBotModal = () => {
    if (saving || testing) return;
    setBotModalOpen(false);
    setEditingBot(null);
  };

  const saveBot = async (e) => {
    e.preventDefault();
    setSaving(true);
    clearMessages();
    try {
      const payload = {
        display_name: botForm.display_name.trim(),
        username: botForm.username.trim() || null,
        bot_token: botForm.bot_token.trim() || undefined,
      };
      if (editingBot) {
        const { data } = await api.patch(`/api/telegram/bots/${editingBot.id}`, payload);
        setBots((prev) => prev.map((b) => (b.id === data.id ? data : b)));
        setFeedback("Bot atualizado com sucesso.");
      } else {
        if (!payload.bot_token) {
          setError("Informe o token do bot");
          return;
        }
        const { data } = await api.post("/api/telegram/bots", {
          display_name: payload.display_name,
          username: payload.username,
          bot_token: payload.bot_token,
        });
        setBots((prev) => [...prev, data]);
        setFeedback("Bot conectado — foto de perfil carregada.");
      }
      setBotModalOpen(false);
      setEditingBot(null);
      setBotForm({ display_name: "", username: "", bot_token: "" });
    } catch (err) {
      setError(apiError(err, "Erro ao salvar"));
    } finally {
      setSaving(false);
    }
  };

  const testBotForm = async () => {
    setTesting(true);
    clearMessages();
    try {
      const { data } = await api.post("/api/telegram/test/bot", {
        bot_token: botForm.bot_token.trim() || undefined,
        bot_id: editingBot?.id,
      });
      setFeedback(`${data.message}${data.bot_username ? ` (@${data.bot_username})` : ""}`);
    } catch (err) {
      setError(apiError(err, "Falha no teste"));
    } finally {
      setTesting(false);
    }
  };

  const confirmDeleteBot = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    clearMessages();
    try {
      await api.delete(`/api/telegram/bots/${deleteTarget.id}`);
      setBots((prev) => prev.filter((b) => b.id !== deleteTarget.id));
      setDeleteTarget(null);
      setFeedback("Bot removido.");
    } catch (err) {
      setError(apiError(err, "Erro ao excluir bot"));
    } finally {
      setDeleting(false);
    }
  };

  const toggleBotActive = async (bot) => {
    setTogglingBotId(bot.id);
    clearMessages();
    try {
      const { data } = await api.patch(`/api/telegram/bots/${bot.id}`, {
        is_active: !bot.is_active,
      });
      setBots((prev) => prev.map((b) => (b.id === data.id ? data : b)));
    } catch (err) {
      setError(apiError(err, "Erro ao atualizar bot"));
    } finally {
      setTogglingBotId(null);
    }
  };

  if (loading) return <p className="muted">Carregando...</p>;

  return (
    <div>
      <div className="page-header">
        <h2>Configurações — Telegram</h2>
      </div>

      <p className="hint" style={{ marginBottom: "1rem" }}>
        Conecte os bots usados nas automações de cada projeto financeiro. As regras de envio ficam na aba{" "}
        <strong>Automações</strong> dentro do projeto.
      </p>

      <div className="toolbar toolbar-spread">
        <p className="hint" style={{ margin: 0 }}>
          Apenas bots <strong>ativos</strong> podem ser selecionados nas automações.
        </p>
        <button type="button" className="btn btn-primary" onClick={openAddBot}>
          + Adicionar bot
        </button>
      </div>

      {feedback && <div className="alert alert-success">{feedback}</div>}
      {error && <p className="error">{error}</p>}

      {bots.length > 0 ? (
        <div className="project-gallery telegram-connection-gallery">
          {bots.map((bot) => (
            <BotConnectionCard
              key={bot.id}
              bot={bot}
              toggling={togglingBotId === bot.id}
              onEdit={openEditBot}
              onDelete={setDeleteTarget}
              onToggleActive={toggleBotActive}
            />
          ))}
        </div>
      ) : (
        <div className="empty-state card">
          <p className="muted">
            Nenhum bot conectado. Clique em <strong>Adicionar bot</strong>.
          </p>
        </div>
      )}

      <Modal
        open={botModalOpen}
        title={editingBot ? `Editar ${editingBot.display_name}` : "Adicionar bot"}
        onClose={closeBotModal}
      >
        <p className="hint">
          Crie o bot no <strong>@BotFather</strong>. Ao salvar, a foto de perfil é buscada automaticamente.
        </p>
        <form className="form-grid" onSubmit={saveBot}>
          <label>
            Nome do bot
            <input
              required
              placeholder="Ex.: Arpadesk Vendas"
              value={botForm.display_name}
              onChange={(e) => setBotForm({ ...botForm, display_name: e.target.value })}
            />
          </label>
          <label>
            @ do bot
            <input
              placeholder="meu_bot"
              value={botForm.username}
              onChange={(e) => setBotForm({ ...botForm, username: e.target.value })}
            />
          </label>
          <label className="full">
            Token do bot
            <input
              type="password"
              required={!editingBot}
              placeholder={editingBot ? "Deixe vazio para manter o atual" : "123456:ABC-DEF..."}
              value={botForm.bot_token}
              onChange={(e) => setBotForm({ ...botForm, bot_token: e.target.value })}
            />
          </label>
          <div className="form-actions full">
            <button type="button" className="btn btn-ghost" onClick={closeBotModal} disabled={saving}>
              Cancelar
            </button>
            <button
              type="button"
              className="btn btn-ghost"
              onClick={testBotForm}
              disabled={testing || (!botForm.bot_token && !editingBot)}
            >
              {testing ? "Testando..." : "Testar conexão"}
            </button>
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? "Salvando..." : "Salvar"}
            </button>
          </div>
        </form>
      </Modal>

      <Modal open={Boolean(deleteTarget)} title="Excluir bot" onClose={() => !deleting && setDeleteTarget(null)}>
        {deleteTarget && (
          <div>
            <p>
              Remover o bot <strong>{deleteTarget.display_name}</strong>
              {deleteTarget.username ? ` (@${deleteTarget.username})` : ""}? Esta ação não pode ser desfeita.
            </p>
            <div className="form-actions">
              <button type="button" className="btn btn-ghost" disabled={deleting} onClick={() => setDeleteTarget(null)}>
                Cancelar
              </button>
              <button type="button" className="btn btn-danger" disabled={deleting} onClick={confirmDeleteBot}>
                {deleting ? "Excluindo..." : "Excluir"}
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
