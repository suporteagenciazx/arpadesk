import { useEffect, useState } from "react";
import { Navigate, useLocation, useParams } from "react-router-dom";
import api from "../../lib/api";
import { useAuth } from "../../context/AuthContext";
import { privilegeSummaryLabels } from "../../lib/privilegeCatalog";
import ProjectPermissionsModal from "../../components/ProjectPermissionsModal";

export default function Permissoes() {
  const { projectId } = useParams();
  const location = useLocation();
  const { isAdmin } = useAuth();
  const [members, setMembers] = useState([]);
  const [view, setView] = useState("gallery");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [editTarget, setEditTarget] = useState(null);
  const [saving, setSaving] = useState(false);

  const load = () => {
    setLoading(true);
    api
      .get(`/api/projects/${projectId}/permissions`)
      .then(({ data }) => setMembers(data || []))
      .catch((e) => setError(e.response?.data?.detail || "Erro ao carregar permissões"))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    if (isAdmin) load();
  }, [projectId, isAdmin]);

  if (!isAdmin) {
    const fallback = location.pathname.includes("/marketing/")
      ? `/p/${projectId}/marketing/campanhas`
      : `/p/${projectId}/financeiro/vendas`;
    return <Navigate to={fallback} replace />;
  }

  const savePrivileges = async (payload) => {
    if (!editTarget) return;
    setSaving(true);
    setError("");
    try {
      await api.put(`/api/projects/${projectId}/permissions/${editTarget.user_id}`, payload);
      setEditTarget(null);
      load();
    } catch (e) {
      setError(e.response?.data?.detail || "Erro ao salvar privilégios");
    } finally {
      setSaving(false);
    }
  };

  const privilegeText = (row) => {
    const finance = (row.sectors || []).find((s) => s.sector_id === "financeiro");
    const labels = privilegeSummaryLabels(finance?.privileges || []);
    return labels.length ? labels.join(", ") : "—";
  };

  return (
    <div className="permissoes-page">
      <div className="page-header">
        <div>
          <h3>Permissões do projeto</h3>
          <p className="subtitle">Usuários operacionais e privilégios por aba do Financeiro.</p>
        </div>
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
      </div>

      {error && <p className="error">{error}</p>}

      {loading ? (
        <p className="muted">Carregando usuários...</p>
      ) : members.length === 0 ? (
        <div className="empty-state card">
          <p>Nenhum usuário operacional atribuído a este projeto.</p>
        </div>
      ) : view === "gallery" ? (
        <div className="project-gallery permissoes-gallery">
          {members.map((m) => (
            <div key={m.user_id} className="project-card permissoes-card">
              <div className="project-card-body permissoes-card-body">
                <strong className="project-card-name">{m.user_name}</strong>
                <span className="project-card-desc">{m.user_email || "—"}</span>
                <span className="badge">{m.user_level}</span>
                <p className="permissoes-privileges">{privilegeText(m)}</p>
              </div>
              <div className="permissoes-card-footer">
                <button type="button" className="btn btn-sm btn-primary" onClick={() => setEditTarget(m)}>
                  Editar
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Nome</th>
                <th>Email</th>
                <th>Nível</th>
                <th>Privilégios</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {members.map((m) => (
                <tr key={m.user_id}>
                  <td>{m.user_name}</td>
                  <td>{m.user_email || "—"}</td>
                  <td>
                    <span className="badge">{m.user_level}</span>
                  </td>
                  <td className="permissoes-privileges-cell">{privilegeText(m)}</td>
                  <td className="actions">
                    <button type="button" className="btn btn-sm btn-ghost" onClick={() => setEditTarget(m)}>
                      Editar
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <ProjectPermissionsModal
        open={Boolean(editTarget)}
        member={editTarget}
        saving={saving}
        onClose={() => !saving && setEditTarget(null)}
        onSave={savePrivileges}
      />
    </div>
  );
}
