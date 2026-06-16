import { useEffect, useState } from "react";
import api from "../../lib/api";

const DEFAULT_REGISTRATION =
  "📝 Nova venda registrada\nProjeto: {{projeto}}\nCódigo: {{sale_code}}\nAgente: {{agente}}\nValor: R$ {{valor}}\nStatus: {{status}}";

const DEFAULT_CONFIRMATION =
  "✅ Venda confirmada {{sale_code}} no projeto {{projeto}}\nAgente: {{agente}}\nValor: R$ {{valor}}\nStatus: {{status}}\nSaldo (lucro): R$ {{balance}}";

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

function DestinationFields({ chatId, sendMode, onChatIdChange, onSendModeChange }) {
  return (
    <div className="form-grid">
      <label>
        Destino (grupo / canal / usuário)
        <input
          placeholder="-1001234567890"
          value={chatId}
          onChange={(e) => onChatIdChange(e.target.value)}
          required
        />
        <span className="hint-inline">Supergrupos usam ID no formato -100… (ajustado ao salvar).</span>
      </label>
      <label>
        Tipo de destino
        <select value={sendMode} onChange={(e) => onSendModeChange(e.target.value)}>
          <option value="group">Grupo</option>
          <option value="channel">Canal</option>
          <option value="user">Usuário específico</option>
        </select>
      </label>
    </div>
  );
}

export default function Telegram() {
  const [botToken, setBotToken] = useState("");
  const [hasToken, setHasToken] = useState(false);

  const [regChatId, setRegChatId] = useState("");
  const [regSendMode, setRegSendMode] = useState("group");
  const [regTemplate, setRegTemplate] = useState(DEFAULT_REGISTRATION);
  const [regEnabled, setRegEnabled] = useState(false);

  const [confChatId, setConfChatId] = useState("");
  const [confSendMode, setConfSendMode] = useState("group");
  const [confTemplate, setConfTemplate] = useState(DEFAULT_CONFIRMATION);

  const [variableGroups, setVariableGroups] = useState([]);
  const [discoveredChats, setDiscoveredChats] = useState([]);
  const [loading, setLoading] = useState(true);

  const [saving, setSaving] = useState({ bot: false, registration: false, confirmation: false });
  const [testing, setTesting] = useState({ bot: false, registration: false, confirmation: false });
  const [discovering, setDiscovering] = useState(false);
  const [feedback, setFeedback] = useState({ bot: "", registration: "", confirmation: "" });
  const [error, setError] = useState({ bot: "", registration: "", confirmation: "" });

  const clearSectionMessages = (section) => {
    setFeedback((f) => ({ ...f, [section]: "" }));
    setError((e) => ({ ...e, [section]: "" }));
  };

  useEffect(() => {
    Promise.all([api.get("/api/telegram/settings"), api.get("/api/telegram/variables")])
      .then(([settingsRes, varsRes]) => {
        const data = settingsRes.data;
        setHasToken(data.has_token);
        if (data.bot_token) setBotToken(data.bot_token);
        setRegChatId(data.registration_chat_id || "");
        setRegSendMode(data.registration_send_mode || "group");
        setRegTemplate(data.registration_template || DEFAULT_REGISTRATION);
        setRegEnabled(Boolean(data.notify_on_registration));
        setConfChatId(data.confirmation_chat_id || "");
        setConfSendMode(data.confirmation_send_mode || "group");
        setConfTemplate(data.confirmation_template || data.message_template || DEFAULT_CONFIRMATION);
        setVariableGroups(varsRes.data.groups || []);
      })
      .catch((e) => setError((prev) => ({ ...prev, bot: e.response?.data?.detail || "Erro ao carregar" })))
      .finally(() => setLoading(false));
  }, []);

  const handleDiscoverChats = async () => {
    setDiscovering(true);
    clearSectionMessages("bot");
    try {
      const { data } = await api.get("/api/telegram/chats");
      setDiscoveredChats(data.chats || []);
      if (!data.chats?.length) {
        setFeedback((f) => ({
          ...f,
          bot: "Nenhuma conversa encontrada. Adicione o bot ao grupo e envie uma mensagem.",
        }));
      }
    } catch (err) {
      setError((e) => ({ ...e, bot: err.response?.data?.detail || "Erro ao listar conversas" }));
    } finally {
      setDiscovering(false);
    }
  };

  const saveBot = async (e) => {
    e.preventDefault();
    setSaving((s) => ({ ...s, bot: true }));
    clearSectionMessages("bot");
    try {
      const { data } = await api.put("/api/telegram/settings/bot", {
        bot_token: botToken || undefined,
      });
      setHasToken(data.has_token);
      setFeedback((f) => ({ ...f, bot: "Token salvo com sucesso." }));
    } catch (err) {
      setError((e) => ({ ...e, bot: err.response?.data?.detail || "Erro ao salvar" }));
    } finally {
      setSaving((s) => ({ ...s, bot: false }));
    }
  };

  const testBot = async () => {
    setTesting((t) => ({ ...t, bot: true }));
    clearSectionMessages("bot");
    try {
      const { data } = await api.post("/api/telegram/test/bot", {
        bot_token: botToken || undefined,
      });
      setFeedback((f) => ({
        ...f,
        bot: `${data.message}${data.bot_username ? ` (@${data.bot_username})` : ""}`,
      }));
    } catch (err) {
      setError((e) => ({ ...e, bot: err.response?.data?.detail || "Falha no teste" }));
    } finally {
      setTesting((t) => ({ ...t, bot: false }));
    }
  };

  const saveRegistration = async (e) => {
    e.preventDefault();
    setSaving((s) => ({ ...s, registration: true }));
    clearSectionMessages("registration");
    try {
      const { data } = await api.put("/api/telegram/settings/registration", {
        chat_id: regChatId,
        send_mode: regSendMode,
        template: regTemplate,
        enabled: regEnabled,
      });
      if (data.registration_chat_id) setRegChatId(data.registration_chat_id);
      setFeedback((f) => ({ ...f, registration: "Notificações de registro salvas." }));
    } catch (err) {
      setError((e) => ({ ...e, registration: err.response?.data?.detail || "Erro ao salvar" }));
    } finally {
      setSaving((s) => ({ ...s, registration: false }));
    }
  };

  const testRegistration = async () => {
    setTesting((t) => ({ ...t, registration: true }));
    clearSectionMessages("registration");
    try {
      const { data } = await api.post("/api/telegram/test/registration", {
        chat_id: regChatId,
        template: regTemplate,
      });
      setFeedback((f) => ({ ...f, registration: data.message }));
      if (regChatId.startsWith("-") && !regChatId.startsWith("-100")) {
        setRegChatId(`-100${regChatId.slice(1)}`);
      }
    } catch (err) {
      setError((e) => ({ ...e, registration: err.response?.data?.detail || "Falha no teste" }));
    } finally {
      setTesting((t) => ({ ...t, registration: false }));
    }
  };

  const saveConfirmation = async (e) => {
    e.preventDefault();
    setSaving((s) => ({ ...s, confirmation: true }));
    clearSectionMessages("confirmation");
    try {
      const { data } = await api.put("/api/telegram/settings/confirmation", {
        chat_id: confChatId,
        send_mode: confSendMode,
        template: confTemplate,
      });
      if (data.confirmation_chat_id) setConfChatId(data.confirmation_chat_id);
      setFeedback((f) => ({ ...f, confirmation: "Notificações de confirmação salvas." }));
    } catch (err) {
      setError((e) => ({ ...e, confirmation: err.response?.data?.detail || "Erro ao salvar" }));
    } finally {
      setSaving((s) => ({ ...s, confirmation: false }));
    }
  };

  const testConfirmation = async () => {
    setTesting((t) => ({ ...t, confirmation: true }));
    clearSectionMessages("confirmation");
    try {
      const { data } = await api.post("/api/telegram/test/confirmation", {
        chat_id: confChatId,
        template: confTemplate,
      });
      setFeedback((f) => ({ ...f, confirmation: data.message }));
      if (confChatId.startsWith("-") && !confChatId.startsWith("-100")) {
        setConfChatId(`-100${confChatId.slice(1)}`);
      }
    } catch (err) {
      setError((e) => ({ ...e, confirmation: err.response?.data?.detail || "Falha no teste" }));
    } finally {
      setTesting((t) => ({ ...t, confirmation: false }));
    }
  };

  const insertVar = (setter) => (key) => setter((t) => `${t}{{${key}}}`);

  if (loading) return <p className="muted">Carregando...</p>;

  return (
    <div>
      <div className="page-header">
        <h2>Configurações — Telegram</h2>
      </div>

      <section className="card telegram-section">
        <h3 className="telegram-section-title">Conexão com o bot</h3>
        <p className="hint">
          Crie o bot no <strong>@BotFather</strong> e informe o token abaixo. Os destinos das notificações são
          configurados nas seções seguintes.
        </p>

        {feedback.bot && <div className="alert alert-success">{feedback.bot}</div>}
        {error.bot && <p className="error">{error.bot}</p>}

        <form onSubmit={saveBot}>
          <label className="full">
            Token do bot
            <input
              type="password"
              placeholder={hasToken ? "•••••••• (deixe vazio para manter)" : "123456:ABC-DEF..."}
              value={botToken}
              onChange={(e) => setBotToken(e.target.value)}
            />
          </label>
          <div className="form-actions">
            <button type="button" className="btn btn-ghost" onClick={handleDiscoverChats} disabled={discovering}>
              {discovering ? "Buscando..." : "Listar conversas do bot"}
            </button>
            <button type="button" className="btn btn-ghost" onClick={testBot} disabled={testing.bot}>
              {testing.bot ? "Testando..." : "Testar conexão"}
            </button>
            <button type="submit" className="btn btn-primary" disabled={saving.bot}>
              {saving.bot ? "Salvando..." : "Salvar"}
            </button>
          </div>
        </form>
      </section>

      <section className="card telegram-section">
        <h3 className="telegram-section-title">Notificações de Registro de Vendas</h3>
        <p className="hint">Enviadas ao cadastrar uma nova venda (status Pendente).</p>

        {feedback.registration && <div className="alert alert-success">{feedback.registration}</div>}
        {error.registration && <p className="error">{error.registration}</p>}

        <form onSubmit={saveRegistration}>
          <div className="settings-row" style={{ marginBottom: "1rem" }}>
            <div>
              <strong>Ativar notificações de registro</strong>
            </div>
            <button
              type="button"
              className={`switch ${regEnabled ? "on" : ""}`}
              role="switch"
              aria-checked={regEnabled}
              onClick={() => setRegEnabled((v) => !v)}
            >
              <span className="switch-thumb" />
            </button>
          </div>

          <DestinationFields
            chatId={regChatId}
            sendMode={regSendMode}
            onChatIdChange={setRegChatId}
            onSendModeChange={setRegSendMode}
          />

          <label className="full" style={{ marginTop: "1rem" }}>
            Mensagem
            <textarea rows={5} value={regTemplate} onChange={(e) => setRegTemplate(e.target.value)} />
          </label>
          <VariableChips
            groups={variableGroups}
            filterGroups={["Geral", "Vendas"]}
            onInsert={insertVar(setRegTemplate)}
          />

          <div className="form-actions">
            <button type="button" className="btn btn-ghost" onClick={handleDiscoverChats} disabled={discovering}>
              {discovering ? "Buscando..." : "Listar conversas"}
            </button>
            <button type="button" className="btn btn-ghost" onClick={testRegistration} disabled={testing.registration}>
              {testing.registration ? "Enviando..." : "Testar"}
            </button>
            <button type="submit" className="btn btn-primary" disabled={saving.registration}>
              {saving.registration ? "Salvando..." : "Salvar"}
            </button>
          </div>
          <ChatPicker chats={discoveredChats} onSelect={setRegChatId} />
        </form>
      </section>

      <section className="card telegram-section">
        <h3 className="telegram-section-title">Notificações de Confirmação de Vendas</h3>
        <p className="hint">
          Enviadas quando o financeiro confirma a venda (status OK). O envio por projeto é controlado pelo switch na
          aba Vendas de cada projeto.
        </p>

        {feedback.confirmation && <div className="alert alert-success">{feedback.confirmation}</div>}
        {error.confirmation && <p className="error">{error.confirmation}</p>}

        <form onSubmit={saveConfirmation}>
          <DestinationFields
            chatId={confChatId}
            sendMode={confSendMode}
            onChatIdChange={setConfChatId}
            onSendModeChange={setConfSendMode}
          />

          <label className="full" style={{ marginTop: "1rem" }}>
            Mensagem
            <textarea rows={6} value={confTemplate} onChange={(e) => setConfTemplate(e.target.value)} />
          </label>
          <VariableChips
            groups={variableGroups}
            filterGroups={["Geral", "Vendas", "Comissões e resumo"]}
            onInsert={insertVar(setConfTemplate)}
          />

          <div className="form-actions">
            <button type="button" className="btn btn-ghost" onClick={handleDiscoverChats} disabled={discovering}>
              {discovering ? "Buscando..." : "Listar conversas"}
            </button>
            <button type="button" className="btn btn-ghost" onClick={testConfirmation} disabled={testing.confirmation}>
              {testing.confirmation ? "Enviando..." : "Testar"}
            </button>
            <button type="submit" className="btn btn-primary" disabled={saving.confirmation}>
              {saving.confirmation ? "Salvando..." : "Salvar"}
            </button>
          </div>
          <ChatPicker chats={discoveredChats} onSelect={setConfChatId} />
        </form>
      </section>
    </div>
  );
}
