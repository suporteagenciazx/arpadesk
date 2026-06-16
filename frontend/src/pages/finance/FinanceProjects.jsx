import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "../../lib/api";
import { useProject } from "../../context/ProjectContext";
import Modal from "../../components/Modal";
import { FolderIcon } from "../../components/Icons";
import { projectDescription } from "../../lib/helpers";

export default function FinanceProjects() {
  const [projects, setProjects] = useState([]);
  const [view, setView] = useState("gallery");
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const { selectProject, clearProject } = useProject();
  const navigate = useNavigate();

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

  return (
    <div>
      <div className="page-header">
        <div>
          <h2>Financeiro</h2>
          <p className="subtitle">Selecione um projeto ou cadastre um novo</p>
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
          <button type="button" className="btn btn-primary" onClick={() => setModalOpen(true)}>
            + Novo projeto
          </button>
        </div>
      </div>

      {error && <p className="error">{error}</p>}

      {loading ? (
        <p className="muted">Carregando projetos...</p>
      ) : view === "gallery" ? (
        <div className="project-gallery">
          {projects.map((p) => (
            <button key={p.id} type="button" className="project-card" onClick={() => openProject(p)}>
              <div className="project-card-icon">
                <FolderIcon size={22} />
              </div>
              <strong>{p.name}</strong>
              <span>{projectDescription(p)}</span>
            </button>
          ))}
          {projects.length === 0 && (
            <div className="empty-state card">
              <p>Nenhum projeto cadastrado.</p>
              <button type="button" className="btn btn-primary" onClick={() => setModalOpen(true)}>
                Criar primeiro projeto
              </button>
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
                  <td>
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
    </div>
  );
}
