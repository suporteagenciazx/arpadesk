import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "../../lib/api";
import { useProject } from "../../context/ProjectContext";
import { useAuth } from "../../context/AuthContext";
import { canCreateProject } from "../../lib/privileges";
import { filterProjectsForUser } from "../../lib/memberAccess";
import Modal from "../../components/Modal";
import ProjectGallery from "../../components/ProjectGallery";
import ProjectFinanceSettingsModal from "../../components/ProjectFinanceSettingsModal";
import Switch from "../../components/Switch";
import { useSectors } from "../../context/SectorsContext";

export default function FinanceProjects() {
  const [projects, setProjects] = useState([]);
  const [view, setView] = useState("gallery");
  const [name, setName] = useState("");
  const [extraSectors, setExtraSectors] = useState([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [settingsTarget, setSettingsTarget] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [adminPassword, setAdminPassword] = useState("");
  const [deleting, setDeleting] = useState(false);
  const { selectProject, clearProject } = useProject();
  const { user, isAdmin } = useAuth();
  const navigate = useNavigate();
  const { optionalSectors } = useSectors();
  const mayCreateProject = canCreateProject(user);

  const load = () => {
    setLoading(true);
    api
      .get("/api/projects")
      .then(({ data }) => setProjects(filterProjectsForUser(data, user, "financeiro")))
      .catch((e) => setError(e.response?.data?.detail || "Erro ao carregar projetos"))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    clearProject();
    load();
  }, [user?.id]);

  const openProject = (p) => {
    selectProject(p);
    navigate(`/p/${p.id}/financeiro/vendas`);
  };

  const createProject = async (e) => {
    e.preventDefault();
    if (!name.trim()) return;
    try {
      const { data } = await api.post("/api/projects", {
        name: name.trim(),
        sectors: extraSectors,
        origin_sector: "financeiro",
      });
      setName("");
      setExtraSectors([]);
      setModalOpen(false);
      openProject(data);
    } catch (err) {
      setError(err.response?.data?.detail || "Erro ao criar projeto");
    }
  };

  const openSettings = (p, e) => {
    e?.stopPropagation?.();
    setSettingsTarget(p);
    setError("");
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

      {error && !settingsTarget && !deleteTarget && <p className="error">{error}</p>}

      <ProjectGallery
        projects={projects}
        view={view}
        loading={loading}
        isAdmin={isAdmin}
        mayCreateProject={mayCreateProject}
        emptyMessage="Nenhum projeto cadastrado."
        onOpen={openProject}
        onOpenSettings={openSettings}
        onDelete={openDelete}
        onCreateClick={() => setModalOpen(true)}
      />

      <Modal open={modalOpen} title="Novo projeto" onClose={() => setModalOpen(false)}>
        <form className="form-grid project-create-form" onSubmit={createProject}>
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
          <div className="full project-settings-switches">
            <p className="hint">Financeiro é incluído automaticamente.</p>
            {optionalSectors.map((s) => (
              <Switch
                key={s.id}
                checked={extraSectors.includes(s.id)}
                onChange={(v) =>
                  setExtraSectors((prev) =>
                    v ? [...prev, s.id] : prev.filter((x) => x !== s.id)
                  )
                }
                label={<strong>{s.label}</strong>}
              />
            ))}
          </div>
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
