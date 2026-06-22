import { NavLink, Outlet, Link, useLocation, useParams, useNavigate } from "react-router-dom";
import { useEffect } from "react";
import { useProject } from "../../context/ProjectContext";
import { FinancePeriodProvider, useFinancePeriod } from "../../context/FinancePeriodContext";
import { CashClosingProvider, useCashClosing } from "../../context/CashClosingContext";
import { FolderIcon } from "../../components/Icons";
import DateFilterBar from "../../components/DateFilterBar";
import PeriodHint from "../../components/PeriodHint";
import { useAuth } from "../../context/AuthContext";
import { fmtDate } from "../../lib/constants";
import api from "../../lib/api";

const TABS = [
  { to: "campanhas", label: "Campanhas", periodChrome: false },
  { to: "relatorio", label: "Relatório", periodChrome: true },
  { to: "clientes", label: "Clientes", periodChrome: false },
  { to: "automacoes", label: "Automações", periodChrome: false, adminOnly: false },
  { to: "permissoes", label: "Permissões", periodChrome: false, adminOnly: true },
];

function MarketingLayoutInner() {
  const { projectId } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const { project, clearProject, selectProject } = useProject();
  const { isAdmin } = useAuth();
  const period = useFinancePeriod();
  const { frozen } = useCashClosing();

  useEffect(() => {
    if (!projectId) return;
    const id = Number(projectId);
    if (project?.id === id) return;
    api
      .get(`/api/projects/${id}`)
      .then(({ data }) => selectProject(data))
      .catch(() => navigate("/marketing", { replace: true }));
  }, [projectId, project?.id, selectProject, navigate]);

  const activeTab = TABS.find((t) => location.pathname.endsWith(`/${t.to}`)) || TABS[0];
  const showPeriodChrome = activeTab.periodChrome;
  const teamBlocked = !isAdmin && (!period.isTeamWeekOpen || frozen);
  const showFreezeOverlay = showPeriodChrome && teamBlocked;

  return (
    <div className="marketing-layout">
      <div className="finance-top-bar">
        <div className="page-header finance-header gestao-page-header">
          <h2>{project?.name || "Projeto"}</h2>
        </div>
        <div className="finance-top-bar-actions">
          {project && (
            <div className="finance-project-actions">
              <div className="project-context-badge">
                <FolderIcon size={18} />
                <Link to="/marketing" className="project-context-link" onClick={clearProject}>
                  Trocar projeto
                </Link>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="tabs">
        {TABS.filter((t) => !t.adminOnly || isAdmin).map((t) => (
          <NavLink
            key={t.to}
            to={`/p/${projectId}/marketing/${t.to}`}
            className={({ isActive }) => `tab ${isActive ? "active" : ""}`}
          >
            {t.label}
          </NavLink>
        ))}
      </div>

      {showPeriodChrome && (
        <DateFilterBar
          preset={period.preset}
          onPresetChange={(id) => period.applyPreset(id)}
          periodStart={period.periodStart}
          periodEnd={period.periodEnd}
          onPeriodStartChange={period.setPeriodStart}
          onPeriodEndChange={period.setPeriodEnd}
          onApplyCustom={(e) => e.preventDefault()}
          weekNavActive={period.weekNavActive}
          weekInfo={period.weekInfo}
          onWeekShift={period.shiftWeek}
          filtersLocked={period.filtersLocked}
          restrictToAtual={!period.hasFullHistory}
        />
      )}

      {showPeriodChrome && <PeriodHint activePeriod={period.activePeriod} />}

      <div
        className={`marketing-content-area${showFreezeOverlay ? " finance-content-frozen" : ""}`}
      >
        <div className="tab-transition">
          <Outlet />
        </div>
        {showFreezeOverlay && (
          <div className="finance-freeze-overlay" role="status" aria-live="polite">
            <div className="finance-freeze-banner">CAIXA FECHADO</div>
            {!period.isTeamWeekOpen && period.activePeriod?.next_opening_date && (
              <p className="finance-freeze-subhint">
                Abertura programada para {fmtDate(period.activePeriod.next_opening_date)}
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default function MarketingLayout() {
  return (
    <FinancePeriodProvider>
      <CashClosingProvider>
        <MarketingLayoutInner />
      </CashClosingProvider>
    </FinancePeriodProvider>
  );
}
