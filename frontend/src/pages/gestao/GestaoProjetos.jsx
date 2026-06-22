import { useEffect, useMemo, useState } from "react";
import api from "../../lib/api";
import { useToast } from "../../context/ToastContext";
import { useSectors } from "../../context/SectorsContext";
import ProjectGallery from "../../components/ProjectGallery";
import ProjectFinanceSettingsModal from "../../components/ProjectFinanceSettingsModal";
import Modal from "../../components/Modal";
import Switch from "../../components/Switch";
import { FolderIcon } from "../../components/Icons";
import { isSectorEnabled } from "../../lib/projectSectors";

export default function GestaoProjetos() {
  const { notify } = useToast();
  const { sectors, optionalSectors } = useSectors();
  const [projects, setProjects] = useState([]);
  const [sectorFilter, setSectorFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [view, setView] = useState("gallery");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [settingsTarget, setSettingsTarget] = useState(null);
  const [settingsProject, setSettingsProject] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [adminPassword, setAdminPassword] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [createName, setCreateName] = useState("");
  const [createSectors, setCreateSectors] = useState([]);
  const [creating, setCreating] = useState(false);

  const load = () => {
    setLoading(true);
    api
      .get("/api/gestao/projects")
      .then(({ data }) => setProjects(data || []))
      .catch((e) => setError(e.response?.data?.detail || "Erro ao carregar projetos"))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, []);

  const filtered = useMemo(() => {
    let list = projects;
    if (sectorFilter !== "all") {
      list = list.filter((p) => isSectorEnabled(p, sectorFilter, sectors));
    }
    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          (p.description || "").toLowerCase().includes(q) ||
          (p.slug || "").toLowerCase().includes(q)
      );
    }
    return list;
  }, [projects, sectorFilter, search, sectors]);

  const openSettings = async (p, e) => {
    e?.stopPropagation?.();
    setSettingsTarget(p);
    setSettingsProject(null);
    try {
      const { data } = await api.get(`/api/projects/${p.id}`);
      setSettingsProject(data);
    } catch {
      notify("Erro ao carregar projeto", "error");
      setSettingsTarget(null);
    }
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
      notify("Projeto excluído.", "success");
    } catch (err) {
      setError(err.response?.data?.detail || "Erro ao excluir projeto");
    } finally {
      setDeleting(false);
    }
  };

  const createProject = async (e) => {
    e.preventDefault();
    if (!createName.trim()) return;
    setCreating(true);
    try {
      await api.post("/api/projects", {
        name: createName.trim(),
        sectors: createSectors,
        origin_sector: "financeiro",
      });
      setCreateName("");
      setCreateSectors([]);
      setCreateOpen(false);
      load();
      notify("Projeto criado.", "success");
    } catch (err) {
      notify(err.response?.data?.detail || "Erro ao criar projeto", "error");
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="gestao-projetos">
      <div className="page-header gestao-section-header">
        <div>
          <h3 className="section-title gestao-section-title">
            <FolderIcon size={22} className="section-title-icon" />
            Projetos
          </h3>
          <p className="hint">Visualize e configure projetos por setor.</p>
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
          <button type="button" className="btn btn-primary btn-sm" onClick={() => setCreateOpen(true)}>
            + Novo projeto
          </button>
        </div>
      </div>

      <div className="gestao-projects-toolbar card">
        <label className="gestao-search">
          <span className="sr-only">Pesquisar projetos</span>
          <input
            type="search"
            placeholder="Pesquisar por nome ou descrição..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>
        <div className="gestao-sector-filter-group">
          <span className="gestao-filter-label">Setor</span>
          <div className="gestao-sector-filters">
            <button
              type="button"
              className={`gestao-sector-pill ${sectorFilter === "all" ? "active" : ""}`}
              onClick={() => setSectorFilter("all")}
            >
              Todos
            </button>
            {sectors.filter((s) => !s.adminOnly).map((s) => (
              <button
                key={s.id}
                type="button"
                className={`gestao-sector-pill ${sectorFilter === s.id ? "active" : ""}`}
                onClick={() => setSectorFilter(s.id)}
              >
                <span className="sector-dot sector-dot--inline" style={{ backgroundColor: s.color }} />
                {s.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {error && !settingsTarget && !deleteTarget && <p className="error">{error}</p>}

      <ProjectGallery
        projects={filtered}
        view={view}
        loading={loading}
        isAdmin
        mayCreateProject={false}
        emptyMessage="Nenhum projeto neste filtro."
        onOpen={(p) => openSettings(p)}
        onOpenSettings={openSettings}
        onDelete={openDelete}
        openButtonLabel="Configurar"
      />

      <ProjectFinanceSettingsModal
        open={Boolean(settingsTarget && settingsProject)}
        projectId={settingsTarget?.id}
        project={settingsProject}
        onClose={() => {
          setSettingsTarget(null);
          setSettingsProject(null);
        }}
        onProjectUpdated={load}
      />

      <Modal open={createOpen} title="Novo projeto" onClose={() => !creating && setCreateOpen(false)}>
        <form className="form-grid" onSubmit={createProject}>
          <p className="hint full">Financeiro é incluído automaticamente em todo projeto.</p>
          <label className="full">
            Nome do projeto
            <input
              required
              placeholder="Ex: AGENCIA"
              value={createName}
              onChange={(e) => setCreateName(e.target.value)}
              autoFocus
            />
          </label>
          <div className="full project-settings-switches">
            {optionalSectors.map((s) => (
              <Switch
                key={s.id}
                checked={createSectors.includes(s.id)}
                onChange={(v) =>
                  setCreateSectors((prev) =>
                    v ? [...prev, s.id] : prev.filter((x) => x !== s.id)
                  )
                }
                label={
                  <div className="sector-config-label">
                    <span className="sector-dot sector-dot--inline" style={{ backgroundColor: s.color }} />
                    <strong>{s.label}</strong>
                  </div>
                }
              />
            ))}
          </div>
          <div className="form-actions full">
            <button type="button" className="btn btn-ghost" onClick={() => setCreateOpen(false)} disabled={creating}>
              Cancelar
            </button>
            <button type="submit" className="btn btn-primary" disabled={creating}>
              {creating ? "Criando..." : "Criar projeto"}
            </button>
          </div>
        </form>
      </Modal>

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
