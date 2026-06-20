import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "../../lib/api";
import { useProject } from "../../context/ProjectContext";
import { useAuth } from "../../context/AuthContext";
import { canCreateProject } from "../../lib/privileges";
import Modal from "../../components/Modal";
import { FolderIcon, PencilIcon, TrashIcon } from "../../components/Icons";
import { projectDescription } from "../../lib/helpers";

export default function FinanceProjects() {
  const [projects, setProjects] = useState([]);
  const [view, setView] = useState("gallery");
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [renameTarget, setRenameTarget] = useState(null);
  const [renameName, setRenameName] = useState("");
  const [renaming, setRenaming] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [adminPassword, setAdminPassword] = useState("");
  const [deleting, setDeleting] = useState(false);
  const { selectProject, clearProject } = useProject();
  const { user, isAdmin } = useAuth();
  const navigate = useNavigate();
  const mayCreateProject = canCreateProject(user);

  const load = () => {
    setLoading(true);
    api
      .get("/api/projects")
      .then(({ data }) => setProjects(data))
      .catch((e) => setError(e.response?.data?.detail || "Erro ao carregar projetos"))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    clearProject();
    load();
  }, []);

  const openProject = (p) => {
    selectProject(p);
    navigate(`/p/${p.id}/financeiro/vendas`);
  };

  const createProject = async (e) => {
    e.preventDefault();
    if (!name.trim()) return;
    try {
      const { data } = await api.post("/api/projects", { name: name.trim() });
      setName("");
      setModalOpen(false);
      openProject(data);
    } catch (err) {
      setError(err.response?.data?.detail || "Erro ao criar projeto");
    }
  };

  const openRename = (p, e) => {
    e.stopPropagation();
    setRenameTarget(p);
    setRenameName(p.name);
    setError("");
  };

  const confirmRename = async (e) => {
    e.preventDefault();
    if (!renameTarget || !renameName.trim()) return;
    setRenaming(true);
    setError("");
    try {
      await api.patch(`/api/projects/${renameTarget.id}`, { name: renameName.trim() });
      setRenameTarget(null);
      setRenameName("");
      load();
    } catch (err) {
      setError(err.response?.data?.detail || "Erro ao renomear projeto");
    } finally {
      setRenaming(false);
    }
  };

  const openDelete = (p, e) => {
    e.stopPropagation();
    setDeleteTarget(p);
    setAdminPassword("");
    setError("");
  };

  const confirmDelete = async (e) => {
    e.preventDefault();
    if (!deleteTarget) return;
    setDeleting(true);
    setError("");
    try {
      await api.post(`/api/projects/${deleteTarget.id}/delete`, {
        admin_password: adminPassword,
      });
      setDeleteTarget(null);
      setAdminPassword("");
      load();
    } catch (err) {
      setError(err.response?.data?.detail || "Erro ao excluir projeto");
    } finally {
      setDeleting(false);
    }
  };

  const adminActions = (p) =>
    isAdmin ? (
      <div className="project-card-actions">
        <button
          type="button"
          className="btn-icon project-action-btn"
          title="Renomear projeto"
          aria-label="Renomear projeto"
          onClick={(e) => openRename(p, e)}
        >
          <PencilIcon size={16} />
        </button>
        <button
          type="button"
          className="btn-icon project-action-btn project-action-btn--danger"
          title="Excluir projeto"
          aria-label="Excluir projeto"
          onClick={(e) => openDelete(p, e)}
        >
          <TrashIcon size={16} />
        </button>
      </div>
    ) : null;

  return (
    <div>
      <div className="page-header">
        <div>
          <h2>Financeiro</h2>
          <p className="subtitle">
            {mayCreateProject
              ? "Selecione um projeto ou cadastre um novo"
              : "Selecione um projeto para continuar"}
          </p>
        </div>
        <div className="toolbar">
          <div className="view-toggle">
            <button
              type="button"
              className={`btn btn-sm ${view === "gallery" ? "btn-primary" : "btn-ghost"}`}
              onClick={() => setView("gallery")}
              title="Galeria"
            >
              ⊞ Galeria
            </button>
            <button
              type="button"
              className={`btn btn-sm ${view === "list" ? "btn-primary" : "btn-ghost"}`}
              onClick={() => setView("list")}
              title="Lista"
            >
              ☰ Lista
            </button>
          </div>
          {mayCreateProject && (
            <button type="button" className="btn btn-primary" onClick={() => setModalOpen(true)}>
              + Novo projeto
            </button>
          )}
        </div>
      </div>

      {error && <p className="error">{error}</p>}

      {loading ? (
        <p className="muted">Carregando projetos...</p>
      ) : view === "gallery" ? (
        <div className="project-gallery">
          {projects.map((p) => (
            <div key={p.id} className="project-card">
              {adminActions(p)}
              <button type="button" className="project-card-open" onClick={() => openProject(p)}>
                <div className="project-card-icon">
                  <FolderIcon size={22} />
                </div>
                <strong>{p.name}</strong>
                <span>{projectDescription(p)}</span>
              </button>
            </div>
          ))}
          {projects.length === 0 && (
            <div className="empty-state card">
              <p>Nenhum projeto cadastrado.</p>
              {mayCreateProject && (
                <button type="button" className="btn btn-primary" onClick={() => setModalOpen(true)}>
                  Criar primeiro projeto
                </button>
              )}
            </div>
          )}
        </div>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Nome</th>
                <th>Descrição</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {projects.map((p) => (
                <tr key={p.id}>
                  <td>
                    <strong>{p.name}</strong>
                  </td>
                  <td className="muted">{projectDescription(p)}</td>
                  <td className="project-list-actions">
                    {isAdmin && (
                      <>
                        <button
                          type="button"
                          className="btn-icon project-action-btn"
                          title="Renomear projeto"
                          aria-label="Renomear projeto"
                          onClick={(e) => openRename(p, e)}
                        >
                          <PencilIcon size={16} />
                        </button>
                        <button
                          type="button"
                          className="btn-icon project-action-btn project-action-btn--danger"
                          title="Excluir projeto"
                          aria-label="Excluir projeto"
                          onClick={(e) => openDelete(p, e)}
                        >
                          <TrashIcon size={16} />
                        </button>
                      </>
                    )}
                    <button type="button" className="btn btn-sm btn-primary" onClick={() => openProject(p)}>
                      Abrir
                    </button>
                  </td>
                </tr>
              ))}
              {projects.length === 0 && (
                <tr>
                  <td colSpan={3} className="muted center">
                    Nenhum projeto cadastrado.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      <Modal open={modalOpen} title="Novo projeto" onClose={() => setModalOpen(false)}>
        <form className="form-grid" onSubmit={createProject}>
          <label className="full">
            Nome do projeto
            <input
              required
              placeholder="Ex: AGENCIA"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
            />
          </label>
          <div className="form-actions full">
            <button type="button" className="btn btn-ghost" onClick={() => setModalOpen(false)}>
              Cancelar
            </button>
            <button type="submit" className="btn btn-primary">
              Criar projeto
            </button>
          </div>
        </form>
      </Modal>

      <Modal
        open={Boolean(renameTarget)}
        title="Renomear projeto"
        onClose={() => !renaming && setRenameTarget(null)}
      >
        {renameTarget && (
          <form className="form-grid" onSubmit={confirmRename}>
            <label className="full">
              Novo nome
              <input
                required
                value={renameName}
                onChange={(e) => setRenameName(e.target.value)}
                autoFocus
              />
            </label>
            <div className="form-actions full">
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => setRenameTarget(null)}
                disabled={renaming}
              >
                Cancelar
              </button>
              <button type="submit" className="btn btn-primary" disabled={renaming}>
                {renaming ? "Salvando..." : "Salvar"}
              </button>
            </div>
          </form>
        )}
      </Modal>

      <Modal
        open={Boolean(deleteTarget)}
        title="Excluir projeto"
        onClose={() => !deleting && setDeleteTarget(null)}
      >
        {deleteTarget && (
          <form onSubmit={confirmDelete}>
            <p>
              Tem certeza que deseja excluir o projeto <strong>{deleteTarget.name}</strong>? Esta
              ação remove vendas, despesas, pagamentos e relatórios vinculados.
            </p>
            <label>
              Senha de administrador
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
                onClick={() => setDeleteTarget(null)}
                disabled={deleting}
              >
                Cancelar
              </button>
              <button type="submit" className="btn btn-danger" disabled={deleting}>
                {deleting ? "Excluindo..." : "Excluir projeto"}
              </button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  );
}
