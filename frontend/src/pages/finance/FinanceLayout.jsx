import { NavLink, Outlet, useLocation, useParams, Link } from "react-router-dom";
import { useProject } from "../../context/ProjectContext";
import { useAuth } from "../../context/AuthContext";
import { FolderIcon } from "../../components/Icons";
import { canAccessFinanceTab } from "../../lib/permissions";

const ALL_TABS = [
  { to: "vendas", label: "Vendas", key: "vendas" },
  { to: "despesas", label: "Despesas", key: "despesas" },
  { to: "comissoes", label: "Comissões", key: "comissoes" },
  { to: "pagamentos", label: "Pagamentos", key: "pagamentos" },
  { to: "relatorio", label: "Relatório", key: "relatorio" },
];

export default function FinanceLayout() {
  const { projectId } = useParams();
  const location = useLocation();
  const { project, clearProject } = useProject();
  const { user } = useAuth();

  const tabs = ALL_TABS.filter((t) => canAccessFinanceTab(user?.level, t.key));

  return (
    <div>
      <div className="finance-top-bar">
        <div className="page-header finance-header">
          <h2>Financeiro</h2>
        </div>
        {project && (
          <div className="project-context-badge">
            <FolderIcon size={18} />
            <span className="project-context-name">{project.name}</span>
            <Link to="/financeiro" className="project-context-link" onClick={clearProject}>
              Trocar projeto
            </Link>
          </div>
        )}
      </div>
      <div className="tabs">
        {tabs.map((t) => (
          <NavLink
            key={t.to}
            to={`/p/${projectId}/financeiro/${t.to}`}
            className={({ isActive }) => `tab ${isActive ? "active" : ""}`}
          >
            {t.label}
          </NavLink>
        ))}
      </div>
      <div key={location.pathname} className="tab-transition">
        <Outlet />
      </div>
    </div>
  );
}
