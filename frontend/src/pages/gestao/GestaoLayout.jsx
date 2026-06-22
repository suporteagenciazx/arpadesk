import { NavLink, Outlet, Navigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";

const TABS = [
  { to: "/gestao", label: "Dashboard", end: true },
  { to: "/gestao/projetos", label: "Projetos" },
  { to: "/gestao/configuracoes", label: "Configurações" },
];

export default function GestaoLayout() {
  const { isAdmin } = useAuth();

  if (!isAdmin) {
    return <Navigate to="/financeiro" replace />;
  }

  return (
    <div className="gestao-layout">
      <div className="finance-top-bar gestao-top-bar">
        <div className="page-header gestao-page-header">
          <h2>Gestão</h2>
          <p className="subtitle">Visão consolidada e administração de projetos por setor</p>
        </div>
      </div>

      <div className="tabs">
        {TABS.map((t) => (
          <NavLink
            key={t.to}
            to={t.to}
            end={t.end}
            className={({ isActive }) => `tab ${isActive ? "active" : ""}`}
          >
            {t.label}
          </NavLink>
        ))}
      </div>

      <div className="tab-transition gestao-content">
        <Outlet />
      </div>
    </div>
  );
}
