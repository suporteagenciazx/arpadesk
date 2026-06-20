import { useEffect, useState } from "react";
import { Navigate, Link, useLocation, useNavigate } from "react-router-dom";
import PageTransition from "./PageTransition";
import {
  FinanceIcon,
  LogOutIcon,
  MenuIcon,
  PanelLeftIcon,
  SettingsIcon,
  SupportIcon,
  TelegramIcon,
  UsersIcon,
} from "./Icons";
import ThemeSwitch from "./ThemeSwitch";
import { useAuth } from "../context/AuthContext";
import { useProject } from "../context/ProjectContext";
import { useMediaQuery } from "../hooks/useMediaQuery";

const SIDEBAR_KEY = "arpadesk_sidebar_collapsed";

function NavLabel({ icon: Icon, children, collapsed }) {
  return (
    <span className="nav-item-inner" title={collapsed ? children : undefined}>
      <Icon size={18} />
      <span className="nav-item-label">{children}</span>
    </span>
  );
}

export default function Layout() {
  const { user, logout, loading, isAdmin } = useAuth();
  const { clearProject } = useProject();
  const location = useLocation();
  const navigate = useNavigate();
  const isMobile = useMediaQuery("(max-width: 768px)");

  const [configOpen, setConfigOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return localStorage.getItem(SIDEBAR_KEY) === "1";
    } catch {
      return false;
    }
  });

  const financeActive =
    location.pathname === "/financeiro" || location.pathname.includes("/financeiro");
  const suporteActive = location.pathname.startsWith("/suporte");
  const configActive =
    isAdmin &&
    (location.pathname === "/config/usuarios" || location.pathname === "/config/telegram");

  const iconOnly = collapsed && !isMobile;

  useEffect(() => {
    if (configActive) setConfigOpen(true);
  }, [configActive]);

  useEffect(() => {
    setMobileOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    if (isMobile) setCollapsed(false);
  }, [isMobile]);

  useEffect(() => {
    if (!isMobile) {
      try {
        localStorage.setItem(SIDEBAR_KEY, collapsed ? "1" : "0");
      } catch {
        /* ignore */
      }
    }
  }, [collapsed, isMobile]);

  if (loading) return <div className="center-page page-transition">Carregando...</div>;
  if (!user) return <Navigate to="/login" replace />;

  const goFinanceiro = () => {
    clearProject();
    if (!financeActive) navigate("/financeiro");
  };

  const toggleConfig = () => {
    if (iconOnly) {
      navigate("/config/usuarios");
      return;
    }
    setConfigOpen((o) => !o);
    if (!configOpen && !configActive) {
      navigate("/config/usuarios");
    }
  };

  const toggleCollapsed = () => setCollapsed((v) => !v);

  const layoutClass = [
    "layout",
    iconOnly ? "layout--sidebar-collapsed" : "",
    mobileOpen ? "layout--mobile-nav-open" : "",
  ]
    .filter(Boolean)
    .join(" ");

  const sidebarClass = [
    "sidebar",
    iconOnly ? "sidebar--collapsed" : "",
    mobileOpen ? "sidebar--open" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={layoutClass}>
      {isMobile && mobileOpen && (
        <button
          type="button"
          className="sidebar-backdrop"
          aria-label="Fechar menu"
          onClick={() => setMobileOpen(false)}
        />
      )}

      <aside className={sidebarClass}>
        <div className="sidebar-header">
          <div className="brand">
            <span className="brand-mark" aria-hidden>
              A
            </span>
            <span className="brand-text">Arpadesk</span>
          </div>
          {!isMobile && (
            <button
              type="button"
              className={`sidebar-collapse-btn ${collapsed ? "sidebar-collapse-btn--flipped" : ""}`}
              onClick={toggleCollapsed}
              title={collapsed ? "Expandir menu" : "Recolher menu"}
              aria-label={collapsed ? "Expandir menu" : "Recolher menu"}
            >
              <PanelLeftIcon size={18} />
            </button>
          )}
          {isMobile && (
            <button
              type="button"
              className="sidebar-close-btn"
              onClick={() => setMobileOpen(false)}
              aria-label="Fechar menu"
            >
              ×
            </button>
          )}
        </div>

        <nav>
          <Link
            to="/financeiro"
            className={`nav-item ${financeActive ? "active" : ""}`}
            onClick={goFinanceiro}
          >
            <NavLabel icon={FinanceIcon} collapsed={iconOnly}>
              Financeiro
            </NavLabel>
          </Link>

          {isAdmin && (
            <Link to="/suporte" className={`nav-item ${suporteActive ? "active" : ""}`}>
              <NavLabel icon={SupportIcon} collapsed={iconOnly}>
                Suporte
              </NavLabel>
            </Link>
          )}

          {isAdmin && iconOnly ? (
            <>
              <Link
                to="/config/usuarios"
                className={`nav-item ${location.pathname === "/config/usuarios" ? "active" : ""}`}
              >
                <NavLabel icon={UsersIcon} collapsed>
                  Usuários
                </NavLabel>
              </Link>
              <Link
                to="/config/telegram"
                className={`nav-item ${location.pathname === "/config/telegram" ? "active" : ""}`}
              >
                <NavLabel icon={TelegramIcon} collapsed>
                  Telegram
                </NavLabel>
              </Link>
            </>
          ) : (
            isAdmin && (
              <div className="nav-group">
                <button
                  type="button"
                  className={`nav-item nav-toggle ${configActive ? "active" : ""}`}
                  onClick={toggleConfig}
                  aria-expanded={configOpen}
                  title={iconOnly ? "Configurações" : undefined}
                >
                  <NavLabel icon={SettingsIcon} collapsed={iconOnly}>
                    Configurações
                  </NavLabel>
                  <span className="nav-chevron">{configOpen ? "▾" : "▸"}</span>
                </button>
                {configOpen && (
                  <div className="nav-submenu">
                    <Link
                      to="/config/usuarios"
                      className={`nav-item nav-sub ${location.pathname === "/config/usuarios" ? "active" : ""}`}
                    >
                      <NavLabel icon={UsersIcon} collapsed={iconOnly}>
                        Usuários
                      </NavLabel>
                    </Link>
                    <Link
                      to="/config/telegram"
                      className={`nav-item nav-sub ${location.pathname === "/config/telegram" ? "active" : ""}`}
                    >
                      <NavLabel icon={TelegramIcon} collapsed={iconOnly}>
                        Telegram
                      </NavLabel>
                    </Link>
                  </div>
                )}
              </div>
            )
          )}
        </nav>

        <div className="sidebar-footer">
          <div className="sidebar-user-card">
            <span className="sidebar-user-avatar" aria-hidden>
              {(user.name || "?").charAt(0).toUpperCase()}
            </span>
            <div className="sidebar-user-meta">
              <span className="sidebar-user-name">{user.name}</span>
              <span className="sidebar-user-role">{user.level || "usuário"}</span>
            </div>
          </div>
          <div className="sidebar-footer-panel">
            <ThemeSwitch collapsed={iconOnly} />
            <button
              type="button"
              className="sidebar-footer-btn sidebar-footer-btn--logout"
              onClick={logout}
              title="Sair"
            >
              <LogOutIcon size={16} className="footer-icon-svg" />
              <span className="footer-btn-label">Sair</span>
            </button>
          </div>
        </div>
      </aside>

      <div className="layout-main">
        {isMobile && (
          <header className="mobile-topbar">
            <button
              type="button"
              className="mobile-menu-btn"
              onClick={() => setMobileOpen(true)}
              aria-label="Abrir menu"
            >
              <MenuIcon size={22} />
            </button>
            <span className="mobile-topbar-title">Arpadesk</span>
          </header>
        )}
        <main className="content">
          <PageTransition />
        </main>
      </div>
    </div>
  );
}
