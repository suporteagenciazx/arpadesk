import { useEffect, useState } from "react";
import Modal from "./Modal";
import { PROJECT_PRIVILEGE_TABS } from "../lib/privilegeCatalog";

function buildUpdatedSectors(existingSectors, selectedCodes) {
  const rows = (existingSectors || []).map((s) => ({ ...s, privileges: [...(s.privileges || [])] }));
  const idx = rows.findIndex((s) => s.sector_id === "financeiro");
  const prev = idx >= 0 ? rows[idx] : { sector_id: "financeiro", enabled: true, privileges: [] };
  const next = {
    sector_id: "financeiro",
    enabled: selectedCodes.length > 0 ? true : Boolean(prev.enabled),
    privileges: selectedCodes,
  };
  if (idx >= 0) rows[idx] = next;
  else rows.push(next);
  return rows;
}

export default function ProjectPermissionsModal({ open, member, onClose, onSave, saving }) {
  const [activeTab, setActiveTab] = useState(PROJECT_PRIVILEGE_TABS[0].id);
  const [selected, setSelected] = useState([]);

  useEffect(() => {
    if (!open || !member) return;
    const finance = (member.sectors || []).find((s) => s.sector_id === "financeiro");
    setSelected([...(finance?.privileges || [])]);
    setActiveTab(PROJECT_PRIVILEGE_TABS[0].id);
  }, [open, member]);

  if (!member) return null;

  const toggleCode = (code) => {
    setSelected((prev) =>
      prev.includes(code) ? prev.filter((c) => c !== code) : [...prev, code]
    );
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    onSave({
      sectors: buildUpdatedSectors(member.sectors, selected),
    });
  };

  const tabDef = PROJECT_PRIVILEGE_TABS.find((t) => t.id === activeTab) || PROJECT_PRIVILEGE_TABS[0];

  return (
    <Modal open={open} title={`Privilégios — ${member.user_name}`} onClose={onClose} wide>
      <form onSubmit={handleSubmit}>
        <p className="hint">
          Selecione os privilégios por aba do Financeiro neste projeto. Alterações valem apenas para{" "}
          <strong>{member.user_name}</strong>.
        </p>

        <div className="tabs project-permissions-tabs">
          {PROJECT_PRIVILEGE_TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              className={`tab ${activeTab === t.id ? "active" : ""}`}
              onClick={() => setActiveTab(t.id)}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="project-permissions-panel">
          {tabDef.privileges.map((p) => (
            <label key={p.code} className="checkbox-label privilege-row">
              <input
                type="checkbox"
                checked={selected.includes(p.code)}
                onChange={() => toggleCode(p.code)}
              />
              <span>
                <strong>
                  {p.label} <span className="privilege-tab-hint">({p.tabHint})</span>
                </strong>
                <small>{p.description}</small>
              </span>
            </label>
          ))}
        </div>

        <div className="form-actions">
          <button type="button" className="btn btn-ghost" onClick={onClose} disabled={saving}>
            Cancelar
          </button>
          <button type="submit" className="btn btn-primary" disabled={saving}>
            {saving ? "Salvando..." : "Salvar privilégios"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
