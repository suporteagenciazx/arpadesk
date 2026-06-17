import { NavLink, Outlet, useLocation, useParams, Link } from "react-router-dom";
import { useProject } from "../../context/ProjectContext";
import { useAuth } from "../../context/AuthContext";
import { FinancePeriodProvider, useFinancePeriod } from "../../context/FinancePeriodContext";
import { FolderIcon } from "../../components/Icons";
import { canAccessFinanceTab } from "../../lib/permissions";
import DateFilterBar from "../../components/DateFilterBar";
import PeriodHint from "../../components/PeriodHint";
import FinanceImportModal from "../../components/FinanceImportModal";

const ALL_TABS = [
  { to: "vendas", label: "Vendas", key: "vendas" },
  { to: "despesas", label: "Despesas", key: "despesas" },
  { to: "comissoes", label: "Comissões", key: "comissoes" },
  { to: "pagamentos", label: "Pagamentos", key: "pagamentos" },
  { to: "relatorio", label: "Relatório", key: "relatorio" },
];

function FinanceLayoutInner() {
  const { projectId } = useParams();
  const location = useLocation();
  const { project, clearProject } = useProject();
  const { user } = useAuth();
  const period = useFinancePeriod();
  const isRelatorio = location.pathname.endsWith("/relatorio");
  const isPagamentos = location.pathname.endsWith("/pagamentos");

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

      <DateFilterBar
        preset={period.preset}
        onPresetChange={(id) => period.applyPreset(id)}
        periodStart={period.periodStart}
        periodEnd={period.periodEnd}
        onPeriodStartChange={period.setPeriodStart}
        onPeriodEndChange={period.setPeriodEnd}
        onApplyCustom={(e) => e.preventDefault()}
        showWeekNav={period.showWeekNav}
        weekInfo={period.weekInfo}
        onWeekShift={period.shiftWeek}
        onImport={isRelatorio ? () => period.setImportModalOpen(true) : undefined}
        hasDraft={period.hasDraft}
        onSaveDraft={period.hasDraft ? period.commitImport : undefined}
        onCancelDraft={isRelatorio && period.hasDraft ? period.discardDraft : undefined}
        savingDraft={period.saving}
        filtersLocked={period.filtersLocked}
        paymentTotalToPay={isPagamentos ? period.pagamentosTotalToPay : null}
      />

      {period.hasDraft && (
        <p className="hint report-import-badge">
          Importação em pré-visualização ({period.importDraft?.fileName}) — confira as abas e clique em{" "}
          <strong>Salvar</strong> ao lado da semana.
        </p>
      )}

      {!isPagamentos && (
        <PeriodHint
          start={period.periodStart}
          end={period.periodEnd}
          preset={period.preset}
          weekInfo={period.weekInfo}
        />
      )}

      <div className="tab-transition">
        <Outlet />
      </div>

      <FinanceImportModal />
    </div>
  );
}

export default function FinanceLayout() {
  return (
    <FinancePeriodProvider>
      <FinanceLayoutInner />
    </FinancePeriodProvider>
  );
}
