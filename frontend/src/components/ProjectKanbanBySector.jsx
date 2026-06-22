import { FolderIcon } from "./Icons";
import { projectDescription } from "../lib/helpers";
import SectorDots from "./SectorDots";

/**
 * Kanban de projetos agrupados por setor (coluna = setor do registry).
 */
export default function ProjectKanbanBySector({
  projects,
  sectors,
  loading,
  onOpen,
  onOpenSettings,
  onDelete,
  isAdmin,
  emptyMessage = "Nenhum projeto.",
}) {
  if (loading) {
    return <p className="muted">Carregando projetos...</p>;
  }

  const columns = (sectors || []).filter((s) => !s.alwaysOn || s.id === "financeiro");

  return (
    <div className="kanban-board project-kanban-board">
      {columns.map((sector) => {
        const columnProjects = projects.filter((p) => {
          const sec = (p.sectors || []).find((s) => s.id === sector.id);
          return sec?.enabled;
        });
        return (
          <div key={sector.id} className="kanban-column project-kanban-column">
            <div
              className="kanban-column-header project-kanban-column-header"
              style={{ borderTopColor: sector.color }}
            >
              <span className="project-kanban-column-title">
                <span className="sector-dot sector-dot--inline" style={{ backgroundColor: sector.color }} />
                {sector.label}
              </span>
              <span className="kanban-count">{columnProjects.length}</span>
            </div>
            <div className="kanban-cards">
              {columnProjects.map((p) => (
                <div key={`${sector.id}-${p.id}`} className="kanban-card project-kanban-card">
                  {isAdmin && (
                    <div className="project-kanban-card-actions">
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm"
                        onClick={(e) => onOpenSettings?.(p, e)}
                      >
                        Config
                      </button>
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm btn-danger-text"
                        onClick={(e) => onDelete?.(p, e)}
                      >
                        Excluir
                      </button>
                    </div>
                  )}
                  <button type="button" className="project-kanban-card-open" onClick={() => onOpen?.(p)}>
                    <div className="project-kanban-card-icon">
                      <FolderIcon size={18} />
                    </div>
                    <strong>{p.name}</strong>
                    {projectDescription(p) && (
                      <p className="muted project-kanban-card-desc">{projectDescription(p)}</p>
                    )}
                    <SectorDots project={p} size="sm" />
                  </button>
                </div>
              ))}
              {columnProjects.length === 0 && (
                <p className="muted project-kanban-empty">Nenhum projeto</p>
              )}
            </div>
          </div>
        );
      })}
      {columns.length === 0 && (
        <div className="empty-state card">
          <p>{emptyMessage}</p>
        </div>
      )}
    </div>
  );
}
