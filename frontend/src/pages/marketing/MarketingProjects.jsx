import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "../../lib/api";
import { useProject } from "../../context/ProjectContext";
import { useAuth } from "../../context/AuthContext";
import { filterProjectsBySector } from "../../lib/projectSectors";
import { filterProjectsForUser } from "../../lib/memberAccess";
import Modal from "../../components/Modal";
import ProjectGallery from "../../components/ProjectGallery";
import ProjectFinanceSettingsModal from "../../components/ProjectFinanceSettingsModal";

export default function MarketingProjects() {
  const [projects, setProjects] = useState([]);
  const [view, setView] = useState("gallery");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [name, setName] = useState("");
  const [settingsTarget, setSettingsTarget] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [adminPassword, setAdminPassword] = useState("");
  const [deleting, setDeleting] = useState(false);
  const { selectProject, clearProject } = useProject();
  const { user, isAdmin } = useAuth();
  const navigate = useNavigate();

  const load = () => {
    setLoading(true);
    api
      .get("/api/projects")
      .then(({ data }) =>
        setProjects(filterProjectsForUser(filterProjectsBySector(data || [], "marketing"), user, "marketing"))
      )
      .catch((e) => setError(e.response?.data?.detail || "Erro ao carregar projetos"))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    clearProject();
    load();
  }, [user?.id]);

  const openProject = (p) => {
    selectProject(p);
    navigate(`/p/${p.id}/marketing/campanhas`);
  };

  const createProject = async (e) => {
    e.preventDefault();
    if (!name.trim()) return;
    try {
      const { data } = await api.post("/api/projects", {
        name: name.trim(),
        sectors: ["marketing"],
        origin_sector: "marketing",
      });
      setName("");
      setModalOpen(false);
      openProject(data);
    } catch (err) {
      setError(err.response?.data?.detail || "Erro ao criar projeto");
    }
  };

  const openSettings = (p, e) => {
    e?.stopPropagation?.();
    setSettingsTarget(p);
  };

  const openDelete = (p, e) => {
    e.stopPropagation();
    setDeleteTarget(p);
    setAdminPassword("");
  };

  const confirmDelete = async (e) => {
    e.preventDefault();
    if (!deleteTarget) return;
    setDeleting(true);
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

  return (
    <div>
      <div className="page-header">
        <div>
          <h2>Marketing</h2>
          <p className="subtitle">
            Projetos com marketing habilitado — todo projeto também aparece no Financeiro.
          </p>
        </div>
        <div className="toolbar">
          <div className="view-toggle">
            <button
              type="button"
              className={`btn btn-sm ${view === "gallery" ? "btn-primary" : "btn-ghost"}`}
              onClick={() => setView("gallery")}
            >
              ⊞ Galeria
            </button>
            <button
              type="button"
              className={`btn btn-sm ${view === "list" ? "btn-primary" : "btn-ghost"}`}
              onClick={() => setView("list")}
            >
              ☰ Lista
            </button>
          </div>
          {isAdmin && (
            <button type="button" className="btn btn-primary" onClick={() => setModalOpen(true)}>
              + Novo projeto
            </button>
          )}
        </div>
      </div>

      {error && !settingsTarget && !deleteTarget && <p className="error">{error}</p>}

      <ProjectGallery
        projects={projects}
        view={view}
        loading={loading}
        isAdmin={isAdmin}
        mayCreateProject={isAdmin}
        emptyMessage="Nenhum projeto com marketing habilitado."
        onOpen={openProject}
        onOpenSettings={openSettings}
        onDelete={openDelete}
        onCreateClick={() => setModalOpen(true)}
      />

      <Modal open={modalOpen} title="Novo projeto (Marketing)" onClose={() => setModalOpen(false)}>
        <form className="form-grid" onSubmit={createProject}>
          <p className="hint full">
            Todo projeto inclui <strong>Financeiro</strong>. Marque setores adicionais se desejar.
          </p>
          <label className="full">
            Nome do projeto
            <input
              required
              placeholder="Ex: CAMPANHA X"
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

      <ProjectFinanceSettingsModal
        open={Boolean(settingsTarget)}
        projectId={settingsTarget?.id}
        project={settingsTarget}
        onClose={() => setSettingsTarget(null)}
        onProjectUpdated={load}
      />

      <Modal
        open={Boolean(deleteTarget)}
        title="Excluir projeto"
        onClose={() => !deleting && setDeleteTarget(null)}
      >
        {deleteTarget && (
          <form onSubmit={confirmDelete}>
            <p>
              Excluir <strong>{deleteTarget.name}</strong>? Todos os dados vinculados serão removidos.
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
              <button type="button" className="btn btn-ghost" onClick={() => setDeleteTarget(null)} disabled={deleting}>
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
