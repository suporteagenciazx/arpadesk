import { useEffect, useState } from "react";
import api from "../../lib/api";
import Modal from "../../components/Modal";
import { USER_LEVELS } from "../../lib/constants";
import { PRIVILEGE_CATALOG } from "../../lib/privileges";
import { UserIcon } from "../../components/Icons";
import { useAuth } from "../../context/AuthContext";
import { Navigate } from "react-router-dom";

const emptyForm = {
  name: "",
  role_function: "",
  email: "",
  password: "",
  telegram: "",
  whatsapp: "",
  level: "agente",
  project_ids: [],
  project_commissions: {},
  privileges: [],
};

export default function Usuarios() {
  const { isAdmin } = useAuth();
  const [users, setUsers] = useState([]);
  const [projects, setProjects] = useState([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [isIlustrativo, setIsIlustrativo] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState("");

  const load = async () => {
    const [u, p] = await Promise.all([api.get("/api/users"), api.get("/api/projects")]);
    setUsers(u.data);
    setProjects(p.data);
  };

  useEffect(() => {
    if (!isAdmin) return;
    load();
  }, [isAdmin]);

  if (!isAdmin) return <Navigate to="/financeiro" replace />;

  const openCreate = () => {
    setEditing(null);
    setIsIlustrativo(false);
    setForm(emptyForm);
    setModalOpen(true);
  };

  const openEdit = (user) => {
    setEditing(user);
    setIsIlustrativo(user.level === "ilustrativo");
    const commissions = {};
    user.projects.forEach((p) => {
      commissions[p.id] = p.commission_percent;
    });
    setForm({
      name: user.name,
      role_function: user.role_function || "",
      email: user.email || "",
      password: "",
      telegram: user.telegram || "",
      whatsapp: user.whatsapp || "",
      level: user.level === "ilustrativo" ? "agente" : user.level,
      project_ids: user.projects.map((p) => p.id),
      project_commissions: commissions,
      privileges: user.privileges || [],
    });
    setModalOpen(true);
  };

  const toggleIlustrativo = (checked) => {
    setIsIlustrativo(checked);
    setForm({
      ...form,
      level: checked ? "ilustrativo" : form.level === "ilustrativo" ? "agente" : form.level,
    });
  };

  const toggleProject = (pid) => {
    const ids = form.project_ids.includes(pid)
      ? form.project_ids.filter((x) => x !== pid)
      : [...form.project_ids, pid];
    setForm({ ...form, project_ids: ids });
  };

  const setCommission = (pid, val) => {
    setForm({
      ...form,
      project_commissions: { ...form.project_commissions, [pid]: Number(val) },
    });
  };

  const togglePrivilege = (code) => {
    const privs = form.privileges.includes(code)
      ? form.privileges.filter((c) => c !== code)
      : [...form.privileges, code];
    setForm({ ...form, privileges: privs });
  };

  const submit = async (e) => {
    e.preventDefault();
    const level = isIlustrativo ? "ilustrativo" : form.level;
    const payload = {
      name: form.name,
      role_function: form.role_function || null,
      telegram: form.telegram || null,
      whatsapp: form.whatsapp || null,
      level,
      project_ids: form.project_ids,
      project_commissions: form.project_commissions,
    };
    if (level !== "ilustrativo") {
      payload.email = form.email;
      if (form.password) payload.password = form.password;
      payload.privileges = form.privileges;
    }
    if (editing) {
      await api.put(`/api/users/${editing.id}`, payload);
    } else {
      if (level !== "ilustrativo" && !form.password) {
        alert("Senha obrigatória para admin/agente");
        return;
      }
      await api.post("/api/users", payload);
    }
    setModalOpen(false);
    load();
  };

  const remove = async (id) => {
    if (!confirm("Excluir usuário?")) return;
    setError("");
    try {
      await api.delete(`/api/users/${id}`);
      load();
    } catch (err) {
      const detail = err.response?.data?.detail;
      setError(typeof detail === "string" ? detail : "Não foi possível excluir o usuário");
    }
  };

  const levelLabel = (l) => USER_LEVELS.find((x) => x.value === l)?.label || l;

  return (
    <div>
      <div className="page-header">
        <h2>Configurações — Usuários</h2>
        <button type="button" className="btn btn-primary" onClick={openCreate}>
          + Novo usuário
        </button>
      </div>

      {error && <p className="error">{error}</p>}

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Nome</th>
              <th>Email</th>
              <th>Nível</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id}>
                <td>
                  <span className="user-cell">
                    <span className="user-avatar-icon">
                      <UserIcon size={16} />
                    </span>
                    {u.name}
                  </span>
                </td>
                <td>{u.email || "—"}</td>
                <td>
                  <span className="badge">{levelLabel(u.level)}</span>
                </td>
                <td className="actions">
                  <button type="button" className="btn btn-sm btn-ghost" onClick={() => openEdit(u)}>
                    Editar
                  </button>
                  <button type="button" className="btn btn-sm btn-danger" onClick={() => remove(u.id)}>
                    Excluir
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Modal
        open={modalOpen}
        title={editing ? "Editar usuário" : "Novo usuário"}
        onClose={() => setModalOpen(false)}
        wide
      >
        <form className="form-grid" onSubmit={submit}>
          <label>
            Nome
            <input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </label>
          <label>
            Função
            <input
              value={form.role_function}
              onChange={(e) => setForm({ ...form, role_function: e.target.value })}
            />
          </label>

          <label className="checkbox-label full">
            <input
              type="checkbox"
              checked={isIlustrativo}
              onChange={(e) => toggleIlustrativo(e.target.checked)}
            />
            Ilustrativo (sem login — apenas para cálculo de % no projeto)
          </label>

          {!isIlustrativo && (
            <>
              <label>
                Nível
                <select value={form.level} onChange={(e) => setForm({ ...form, level: e.target.value })}>
                  <option value="financeiro">Financeiro</option>
                  <option value="contador">Contador</option>
                  <option value="admin">Admin</option>
                </select>
              </label>
              <label>
                Email
                <input
                  type="email"
                  required={!editing}
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                />
              </label>
              <label>
                Senha {editing && "(deixe vazio para manter)"}
                <input
                  type="password"
                  required={!editing}
                  value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                />
              </label>
            </>
          )}

          <label>
            Telegram
            <input value={form.telegram} onChange={(e) => setForm({ ...form, telegram: e.target.value })} />
          </label>
          <label>
            WhatsApp
            <input value={form.whatsapp} onChange={(e) => setForm({ ...form, whatsapp: e.target.value })} />
          </label>

          {!isIlustrativo && (
            <div className="full project-assign">
              <h4>Privilégios</h4>
              <p className="hint">Funcionalidades extras habilitadas para este usuário no login.</p>
              {PRIVILEGE_CATALOG.map((p) => (
                <label key={p.code} className="checkbox-label privilege-row">
                  <input
                    type="checkbox"
                    checked={form.privileges.includes(p.code)}
                    onChange={() => togglePrivilege(p.code)}
                  />
                  <span>
                    <strong>{p.label}</strong>
                    <small>{p.description}</small>
                  </span>
                </label>
              ))}
            </div>
          )}

          <div className="full project-assign">
            <h4>Projetos financeiros</h4>
            {projects.map((p) => (
              <div key={p.id} className="project-assign-row">
                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={form.project_ids.includes(p.id)}
                    onChange={() => toggleProject(p.id)}
                  />
                  {p.name}
                </label>
                {form.project_ids.includes(p.id) && !isIlustrativo && form.level === "admin" && (
                  <span className="hint-inline">Admin recebe 100% do lucro (saldo)</span>
                )}
                {form.project_ids.includes(p.id) && (isIlustrativo || form.level === "contador" || form.level === "agente") && (
                  <label>
                    % comissão
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      max="100"
                      value={form.project_commissions[p.id] ?? 0}
                      onChange={(e) => setCommission(p.id, e.target.value)}
                    />
                  </label>
                )}
              </div>
            ))}
          </div>

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
  );
}
