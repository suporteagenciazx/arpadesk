import Switch from "./Switch";

function DragHandle({ className = "" }) {
  return (
    <span className={`sector-drag-handle ${className}`.trim()} aria-hidden title="Arrastar para reordenar">
      ⠿
    </span>
  );
}

function SectorActions({ sector, saving, onEdit, onRemove, canRemove }) {
  return (
    <div className="sector-registry-actions">
      <button type="button" className="btn btn-ghost btn-sm" onClick={() => onEdit(sector)}>
        Editar
      </button>
      {canRemove && (
        <button
          type="button"
          className="btn btn-ghost btn-sm btn-danger-text"
          onClick={() => onRemove(sector)}
          disabled={saving}
        >
          Excluir
        </button>
      )}
    </div>
  );
}

export default function SectorRegistryPanel({
  items,
  view,
  saving,
  dragIndex,
  dropTarget,
  onDragStart,
  onDragOver,
  onDragLeave,
  onDrop,
  onDragEnd,
  onToggleSidebar,
  onEdit,
  onRemove,
}) {
  if (view === "gallery") {
    return (
      <div className="sector-registry-gallery">
        {items.map((s, index) => (
          <article
            key={s.id}
            className={`sector-registry-gallery-card card${
              dropTarget === index ? " sector-registry-row--drop-target" : ""
            }`}
            draggable={!saving}
            onDragStart={(e) => onDragStart(e, index)}
            onDragOver={(e) => onDragOver(e, index)}
            onDragLeave={onDragLeave}
            onDrop={(e) => onDrop(e, index)}
            onDragEnd={onDragEnd}
          >
            {s.always_on && (
              <span className="sector-registry-corner-badge badge badge-sm">Obrigatório</span>
            )}
            {!s.always_on && s.admin_only && (
              <span className="sector-registry-corner-badge badge badge-sm">Admin</span>
            )}
            <div className="sector-registry-gallery-head">
              <DragHandle />
              <div className="sector-registry-gallery-title">
                <span className="sector-dot sector-dot--lg" style={{ backgroundColor: s.color }} />
                <strong>{s.label}</strong>
              </div>
            </div>
            <Switch
              checked={Boolean(s.sidebar_visible)}
              disabled={saving || !s.route}
              onChange={(v) => onToggleSidebar(s.id, v)}
              label={<span className="hint-inline">Exibir na sidebar</span>}
            />
            <SectorActions
              sector={s}
              saving={saving}
              onEdit={onEdit}
              onRemove={onRemove}
              canRemove={!s.always_on && s.id !== "financeiro"}
            />
          </article>
        ))}
      </div>
    );
  }

  return (
    <div className="table-wrap sector-registry-table-wrap">
      <table className="sector-registry-table">
        <thead>
          <tr>
            <th className="sector-col-drag" aria-label="Ordem" />
            <th>Setor</th>
            <th>Rota</th>
            <th>Sidebar</th>
            <th className="sector-col-actions">Ações</th>
          </tr>
        </thead>
        <tbody>
          {items.map((s, index) => (
            <tr
              key={s.id}
              className={`sector-registry-row-draggable${
                dragIndex === index ? " sector-registry-row--dragging" : ""
              }${dropTarget === index ? " sector-registry-row--drop-target" : ""}`}
              draggable={!saving}
              onDragStart={(e) => onDragStart(e, index)}
              onDragOver={(e) => onDragOver(e, index)}
              onDragLeave={onDragLeave}
              onDrop={(e) => onDrop(e, index)}
              onDragEnd={onDragEnd}
            >
              <td className="sector-col-drag">
                <DragHandle />
              </td>
              <td>
                <div className="sector-registry-meta sector-registry-meta--table">
                  <span className="sector-dot sector-dot--inline" style={{ backgroundColor: s.color }} />
                  <div className="sector-registry-table-label">
                    <strong>{s.label}</strong>
                    {s.always_on && <span className="badge badge-sm">Obrigatório</span>}
                    {!s.always_on && s.admin_only && <span className="badge badge-sm">Admin</span>}
                  </div>
                </div>
              </td>
              <td className="muted">{s.route || "—"}</td>
              <td className="sector-col-sidebar">
                <Switch
                  checked={Boolean(s.sidebar_visible)}
                  disabled={saving || !s.route}
                  onChange={(v) => onToggleSidebar(s.id, v)}
                  label=""
                />
              </td>
              <td className="sector-col-actions">
                <SectorActions
                  sector={s}
                  saving={saving}
                  onEdit={onEdit}
                  onRemove={onRemove}
                  canRemove={!s.always_on && s.id !== "financeiro"}
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
