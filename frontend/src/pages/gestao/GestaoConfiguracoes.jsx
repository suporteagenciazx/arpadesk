import { useEffect, useState } from "react";
import api from "../../lib/api";
import { useToast } from "../../context/ToastContext";
import { useSectors } from "../../context/SectorsContext";
import Switch from "../../components/Switch";
import Modal from "../../components/Modal";
import SectorRegistryPanel from "../../components/SectorRegistryPanel";

const emptyDraft = () => ({
  id: "",
  label: "",
  color: "#64748b",
  always_on: false,
  admin_only: false,
  sidebar_visible: true,
  sidebar_order: 0,
  route: "",
});

export default function GestaoConfiguracoes() {
  const { notify } = useToast();
  const { reloadSectors } = useSectors();
  const [items, setItems] = useState([]);
  const [view, setView] = useState("list");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [draft, setDraft] = useState(emptyDraft());
  const [isNew, setIsNew] = useState(false);
  const [dragIndex, setDragIndex] = useState(null);
  const [dropTarget, setDropTarget] = useState(null);

  const load = () => {
    setLoading(true);
    api
      .get("/api/gestao/sectors")
      .then(({ data }) => setItems(data.sectors || []))
      .catch(() => notify("Erro ao carregar setores", "error"))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, []);

  const persist = async (nextItems) => {
    setSaving(true);
    try {
      const { data } = await api.put("/api/gestao/sectors", {
        sectors: nextItems.map((s, i) => ({
          id: s.id,
          label: s.label,
          color: s.color,
          always_on: Boolean(s.always_on),
          admin_only: Boolean(s.admin_only),
          sidebar_visible: Boolean(s.sidebar_visible),
          sidebar_order: i,
          route: s.route || null,
        })),
      });
      setItems(data.sectors || []);
      await reloadSectors();
      notify("Setores salvos.", "success");
    } catch (e) {
      notify(e.response?.data?.detail || "Erro ao salvar setores", "error");
    } finally {
      setSaving(false);
    }
  };

  const reorder = (from, to) => {
    if (from === null || from === to) return;
    const next = [...items];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    setItems(next);
    persist(next);
  };

  const handleDragStart = (e, index) => {
    setDragIndex(index);
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", String(index));
  };

  const handleDragOver = (e, index) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setDropTarget(index);
  };

  const handleDragLeave = () => setDropTarget(null);

  const handleDrop = (e, index) => {
    e.preventDefault();
    const from = dragIndex ?? Number(e.dataTransfer.getData("text/plain"));
    setDragIndex(null);
    setDropTarget(null);
    reorder(from, index);
  };

  const handleDragEnd = () => {
    setDragIndex(null);
    setDropTarget(null);
  };

  const openNew = () => {
    setDraft(emptyDraft());
    setIsNew(true);
    setEditOpen(true);
  };

  const openEdit = (s) => {
    setDraft({
      id: s.id,
      label: s.label,
      color: s.color,
      always_on: Boolean(s.always_on),
      admin_only: Boolean(s.admin_only),
      sidebar_visible: Boolean(s.sidebar_visible),
      sidebar_order: s.sidebar_order,
      route: s.route || "",
    });
    setIsNew(false);
    setEditOpen(true);
  };

  const saveDraft = (e) => {
    e.preventDefault();
    if (!draft.label.trim()) return;
    let next;
    if (isNew) {
      const id =
        draft.id.trim() ||
        draft.label
          .toLowerCase()
          .normalize("NFD")
          .replace(/[\u0300-\u036f]/g, "")
          .replace(/[^a-z0-9]+/g, "_")
          .replace(/^_|_$/g, "");
      next = [
        ...items,
        {
          ...draft,
          id,
          label: draft.label.trim(),
          sidebar_order: items.length,
        },
      ];
    } else {
      next = items.map((s) => (s.id === draft.id ? { ...s, ...draft, label: draft.label.trim() } : s));
    }
    setItems(next);
    setEditOpen(false);
    persist(next);
  };

  const removeSector = (s) => {
    if (s.always_on || s.id === "financeiro") {
      notify("O setor Financeiro não pode ser excluído.", "error");
      return;
    }
    if (!window.confirm(`Excluir o setor "${s.label}"?`)) return;
    const next = items.filter((x) => x.id !== s.id);
    setItems(next);
    persist(next);
  };

  const toggleSidebar = (id, visible) => {
    const next = items.map((x) => (x.id === id ? { ...x, sidebar_visible: visible } : x));
    setItems(next);
    persist(next);
  };

  return (
    <div className="gestao-configuracoes">
      <section className="card sector-registry-card">
        <div className="sector-registry-card-head">
          <div className="sector-registry-card-intro">
            <h3 className="section-title">Setores do sistema</h3>
            <p className="hint">
              Arraste para definir a ordem na barra lateral. Por projeto, ative setores nas
              configurações de cada projeto.
            </p>
          </div>
          <div className="toolbar sector-registry-card-toolbar">
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
            <button type="button" className="btn btn-primary btn-sm" onClick={openNew} disabled={saving}>
              + Novo setor
            </button>
          </div>
        </div>

        {loading ? (
          <p className="muted sector-registry-loading">Carregando setores...</p>
        ) : (
          <SectorRegistryPanel
            items={items}
            view={view}
            saving={saving}
            dragIndex={dragIndex}
            dropTarget={dropTarget}
            onDragStart={handleDragStart}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onDragEnd={handleDragEnd}
            onToggleSidebar={toggleSidebar}
            onEdit={openEdit}
            onRemove={removeSector}
          />
        )}
      </section>

      <Modal
        open={editOpen}
        title={isNew ? "Novo setor" : `Editar — ${draft.label}`}
        onClose={() => !saving && setEditOpen(false)}
      >
        <form className="form-grid" onSubmit={saveDraft}>
          <label className="full">
            Nome
            <input
              required
              value={draft.label}
              onChange={(e) => setDraft({ ...draft, label: e.target.value })}
              placeholder="Ex.: Comercial"
            />
          </label>
          {isNew && (
            <label className="full">
              ID (slug)
              <input
                value={draft.id}
                onChange={(e) => setDraft({ ...draft, id: e.target.value })}
                placeholder="Gerado automaticamente se vazio"
              />
            </label>
          )}
          <label>
            Cor
            <input
              type="color"
              value={draft.color}
              onChange={(e) => setDraft({ ...draft, color: e.target.value })}
            />
          </label>
          <label>
            Rota sidebar
            <input
              value={draft.route}
              onChange={(e) => setDraft({ ...draft, route: e.target.value })}
              placeholder="/comercial"
            />
          </label>
          <Switch
            checked={draft.sidebar_visible}
            onChange={(v) => setDraft({ ...draft, sidebar_visible: v })}
            label={<strong>Exibir na barra lateral</strong>}
          />
          <Switch
            checked={draft.admin_only}
            onChange={(v) => setDraft({ ...draft, admin_only: v })}
            label={
              <div>
                <strong>Somente administradores</strong>
                <p className="hint-inline">Visível na sidebar só para admins</p>
              </div>
            }
          />
          <div className="form-actions full">
            <button type="button" className="btn btn-ghost" onClick={() => setEditOpen(false)}>
              Cancelar
            </button>
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? "Salvando..." : "Salvar"}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
