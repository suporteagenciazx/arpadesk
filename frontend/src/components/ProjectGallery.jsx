import { FolderIcon, SettingsIcon, TrashIcon } from "./Icons";
import { projectDescription } from "../lib/helpers";
import SectorDots from "./SectorDots";

export default function ProjectGallery({
  projects,
  view,
  loading,
  isAdmin,
  mayCreateProject,
  emptyMessage = "Nenhum projeto cadastrado.",
  openButtonLabel = "Abrir",
  onOpen,
  onOpenSettings,
  onDelete,
  onCreateClick,
}) {
  const adminActions = (p) =>
    isAdmin ? (
      <div className="project-card-actions">
        <button
          type="button"
          className="btn-icon project-action-btn"
          title="Configurações do projeto"
          aria-label="Configurações do projeto"
          onClick={(e) => onOpenSettings(p, e)}
        >
          <SettingsIcon size={16} />
        </button>
        <button
          type="button"
          className="btn-icon project-action-btn project-action-btn--danger"
          title="Excluir projeto"
          aria-label="Excluir projeto"
          onClick={(e) => onDelete(p, e)}
        >
          <TrashIcon size={16} />
        </button>
      </div>
    ) : null;

  if (loading) {
    return <p className="muted">Carregando projetos...</p>;
  }

  if (view === "gallery") {
    return (
      <div className="project-gallery">
        {projects.map((p) => (
          <div key={p.id} className="project-card">
            {adminActions(p)}
            <button type="button" className="project-card-open" onClick={() => onOpen(p)}>
              <div className="project-card-icon">
                <FolderIcon size={22} />
              </div>
              <div className="project-card-body">
                <strong className="project-card-name">{p.name}</strong>
                {projectDescription(p) && (
                  <span className="project-card-desc">{projectDescription(p)}</span>
                )}
                <SectorDots project={p} size="sm" className="project-sector-dots" />
              </div>
            </button>
          </div>
        ))}
        {projects.length === 0 && (
          <div className="empty-state card">
            <p>{emptyMessage}</p>
            {mayCreateProject && onCreateClick && (
              <button type="button" className="btn btn-primary" onClick={onCreateClick}>
                Criar primeiro projeto
              </button>
            )}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Nome</th>
            <th>Descrição</th>
            <th>Setores</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {projects.map((p) => (
            <tr key={p.id}>
              <td>
                <strong>{p.name}</strong>
              </td>
              <td className="muted">{projectDescription(p)}</td>
              <td className="project-list-sectors">
                <SectorDots project={p} size="md" />
              </td>
              <td className="project-list-actions">
                {isAdmin && (
                  <>
                    <button
                      type="button"
                      className="btn-icon project-action-btn"
                      title="Configurações do projeto"
                      aria-label="Configurações do projeto"
                      onClick={(e) => onOpenSettings(p, e)}
                    >
                      <SettingsIcon size={16} />
                    </button>
                    <button
                      type="button"
                      className="btn-icon project-action-btn project-action-btn--danger"
                      title="Excluir projeto"
                      aria-label="Excluir projeto"
                      onClick={(e) => onDelete(p, e)}
                    >
                      <TrashIcon size={16} />
                    </button>
                  </>
                )}
                <button type="button" className="btn btn-sm btn-primary" onClick={() => onOpen(p)}>
                  {openButtonLabel}
                </button>
              </td>
            </tr>
          ))}
          {projects.length === 0 && (
            <tr>
              <td colSpan={4} className="muted center">
                {emptyMessage}
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
