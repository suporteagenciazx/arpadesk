import { useEffect, useState } from "react";
import { Navigate, Link, useLocation, useNavigate } from "react-router-dom";
import PageTransition from "./PageTransition";
import {
  FinanceIcon,
  SettingsIcon,
  SupportIcon,
  TelegramIcon,
  UsersIcon,
} from "./Icons";
import { useAuth } from "../context/AuthContext";
import { useProject } from "../context/ProjectContext";
import { useTheme } from "../context/ThemeContext";

function NavLabel({ icon: Icon, children }) {
  return (
    <span className="nav-item-inner">
      <Icon size={18} />
      <span>{children}</span>
    </span>
  );
}

export default function Layout() {
  const { user, logout, loading, isAdmin } = useAuth();
  const { clearProject } = useProject();
  const { theme, toggleTheme } = useTheme();
  const location = useLocation();
  const navigate = useNavigate();
  const [configOpen, setConfigOpen] = useState(false);

  const financeActive =
    location.pathname === "/financeiro" || location.pathname.includes("/financeiro");
  const suporteActive = location.pathname.startsWith("/suporte");
  const configActive =
    isAdmin &&
    (location.pathname === "/config/usuarios" || location.pathname === "/config/telegram");

  useEffect(() => {
    if (configActive) setConfigOpen(true);
  }, [configActive]);

  if (loading) return <div className="center-page page-transition">Carregando...</div>;
  if (!user) return <Navigate to="/login" replace />;

  const goFinanceiro = () => {
    clearProject();
    if (!financeActive) navigate("/financeiro");
  };

  const toggleConfig = () => {
    setConfigOpen((o) => !o);
    if (!configOpen && !configActive) {
      navigate("/config/usuarios");
    }
  };

  return (
    <div className="layout">
      <aside className="sidebar">
        <div className="brand">Arpadesk</div>

        <nav>
          <Link
            to="/financeiro"
            className={`nav-item ${financeActive ? "active" : ""}`}
            onClick={goFinanceiro}
          >
            <NavLabel icon={FinanceIcon}>Financeiro</NavLabel>
          </Link>

          {isAdmin && (
            <Link to="/suporte" className={`nav-item ${suporteActive ? "active" : ""}`}>
              <NavLabel icon={SupportIcon}>Suporte</NavLabel>
            </Link>
          )}

          {isAdmin && (
            <div className="nav-group">
              <button
                type="button"
                className={`nav-item nav-toggle ${configActive ? "active" : ""}`}
                onClick={toggleConfig}
                aria-expanded={configOpen}
              >
                <NavLabel icon={SettingsIcon}>Configurações</NavLabel>
                <span className="nav-chevron">{configOpen ? "▾" : "▸"}</span>
              </button>
              {configOpen && (
                <div className="nav-submenu">
                  <Link
                    to="/config/usuarios"
                    className={`nav-item nav-sub ${location.pathname === "/config/usuarios" ? "active" : ""}`}
                  >
                    <NavLabel icon={UsersIcon}>Usuários</NavLabel>
                  </Link>
                  <Link
                    to="/config/telegram"
                    className={`nav-item nav-sub ${location.pathname === "/config/telegram" ? "active" : ""}`}
                  >
                    <NavLabel icon={TelegramIcon}>Telegram</NavLabel>
                  </Link>
                </div>
              )}
            </div>
          )}
        </nav>

        <div className="sidebar-footer">
          <span className="user-name">{user.name}</span>
          <div className="footer-actions">
            <button
              type="button"
              className="btn btn-ghost btn-sm theme-toggle"
              onClick={toggleTheme}
              title={theme === "light" ? "Modo escuro" : "Modo claro"}
            >
              {theme === "light" ? "◐ Escuro" : "◑ Claro"}
            </button>
            <button type="button" className="btn btn-ghost btn-sm" onClick={logout}>
              Sair
            </button>
          </div>
        </div>
      </aside>
      <main className="content">
        <PageTransition />
      </main>
    </div>
  );
}
