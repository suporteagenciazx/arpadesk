import { NavLink, Outlet, useLocation, useParams, Link } from "react-router-dom";
import { useEffect, useMemo, useState } from "react";
import { useProject } from "../../context/ProjectContext";
import { useAuth } from "../../context/AuthContext";
import { FinancePeriodProvider, useFinancePeriod } from "../../context/FinancePeriodContext";
import { CashClosingProvider, useCashClosing } from "../../context/CashClosingContext";
import { FolderIcon } from "../../components/Icons";
import { canAccessFinanceTab } from "../../lib/permissions";
import DateFilterBar from "../../components/DateFilterBar";
import PeriodHint from "../../components/PeriodHint";
import FinanceImportModal from "../../components/FinanceImportModal";
import Modal from "../../components/Modal";
import SaveReportModal from "../../components/SaveReportModal";
import { useToast } from "../../context/ToastContext";
import api from "../../lib/api";
import {
  clearReportEditSession,
  isPageReload,
  markReportEditReload,
  matchesReportEditSession,
  wasReportEditReload,
} from "../../lib/reportEditSession";

const ALL_TABS = [
  { to: "vendas", label: "Vendas", key: "vendas" },
  { to: "despesas", label: "Despesas", key: "despesas" },
  { to: "comissoes", label: "Comissões", key: "comissoes" },
  { to: "pagamentos", label: "Pagamentos", key: "pagamentos" },
  { to: "relatorio", label: "Relatório", key: "relatorio" },
  { to: "arquivo", label: "Arquivo", key: "arquivo" },
];

function FinanceLayoutInner() {
  const { projectId } = useParams();
  const location = useLocation();
  const { project, clearProject } = useProject();
  const { user, isAdmin } = useAuth();
  const { notify } = useToast();
  const period = useFinancePeriod();
  const {
    frozen,
    tabsLocked,
    isUnlocked,
    successOpen,
    setSuccessOpen,
    refreshClosing,
  } = useCashClosing();
  const [saveReportOpen, setSaveReportOpen] = useState(false);
  const [saveReportPreview, setSaveReportPreview] = useState(null);
  const [loadingSaveReport, setLoadingSaveReport] = useState(false);
  const [savingReport, setSavingReport] = useState(false);
  const [editRecoveryOpen, setEditRecoveryOpen] = useState(false);
  const [discardingEdit, setDiscardingEdit] = useState(false);

  const isRelatorio = location.pathname.endsWith("/relatorio");
  const isPagamentos = location.pathname.endsWith("/pagamentos");
  const isArquivo = location.pathname.endsWith("/arquivo");
  const isVendas = location.pathname.endsWith("/vendas");
  const isDespesas = location.pathname.endsWith("/despesas");
  const showPeriodChrome = !isArquivo;

  const isReportEditing = useMemo(
    () =>
      matchesReportEditSession(projectId, period.periodStart, period.periodEnd) && isUnlocked,
    [projectId, period.periodStart, period.periodEnd, isUnlocked]
  );

  const showFreezeOverlay =
    !isArquivo &&
    !isAdmin &&
    (frozen || ((isVendas || isDespesas) && tabsLocked));

  const tabs = ALL_TABS.filter((t) => canAccessFinanceTab(user?.level, t.key));

  useEffect(() => {
    if (!isReportEditing) return undefined;
    const onBeforeUnload = (e) => {
      markReportEditReload();
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [isReportEditing]);

  useEffect(() => {
    if (!isReportEditing) return;
    const shouldPrompt = wasReportEditReload() || isPageReload();
    if (shouldPrompt) {
      setEditRecoveryOpen(true);
    }
  }, [isReportEditing, projectId, period.periodStart, period.periodEnd]);

  const openSaveReport = async () => {
    setSaveReportOpen(true);
    setLoadingSaveReport(true);
    setSaveReportPreview(null);
    try {
      const { data } = await api.get(`/api/projects/${projectId}/report-save/preview`, {
        params: period.params(),
      });
      setSaveReportPreview(data);
    } catch (err) {
      notify(err.response?.data?.detail || "Erro ao carregar resumo", "error");
      setSaveReportOpen(false);
    } finally {
      setLoadingSaveReport(false);
    }
  };

  const confirmSaveReport = async () => {
    setSavingReport(true);
    try {
      await api.post(`/api/projects/${projectId}/report-save`, null, { params: period.params() });
      setSaveReportOpen(false);
      setSaveReportPreview(null);
      setEditRecoveryOpen(false);
      clearReportEditSession();
      await refreshClosing();
      notify("Relatório salvo — período fechado oficialmente.", "success");
      period.bumpReload();
    } catch (err) {
      notify(err.response?.data?.detail || "Erro ao salvar relatório", "error");
    } finally {
      setSavingReport(false);
    }
  };

  const discardReportEdit = async () => {
    setDiscardingEdit(true);
    try {
      await api.post(`/api/projects/${projectId}/report-archive/cancel-edit`, null, {
        params: period.params(),
      });
      clearReportEditSession();
      setEditRecoveryOpen(false);
      await refreshClosing();
      period.bumpReload();
      notify("Edição descartada — relatório bloqueado novamente.", "success");
    } catch (err) {
      notify(err.response?.data?.detail || "Erro ao sair da edição", "error");
    } finally {
      setDiscardingEdit(false);
    }
  };

  const handleRecoverySave = () => {
    setEditRecoveryOpen(false);
    openSaveReport();
  };

  return (
    <div>
      <div className="finance-top-bar">
        <div className="page-header finance-header">
          <h2>Financeiro</h2>
        </div>
        <div className="finance-top-bar-actions">
          {isReportEditing && (
            <span className="report-editing-badge" role="status">
              Editando
            </span>
          )}
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
          onSaveReport={isRelatorio ? openSaveReport : undefined}
          savingReport={savingReport || loadingSaveReport}
          onImport={isRelatorio ? () => period.setImportModalOpen(true) : undefined}
          hasDraft={period.hasDraft}
          onSaveDraft={period.hasDraft ? period.commitImport : undefined}
          onCancelDraft={isRelatorio && period.hasDraft ? period.discardDraft : undefined}
          savingDraft={period.saving}
          filtersLocked={period.filtersLocked}
          restrictToAtual={!period.hasFullHistory}
          paymentTotalToPay={isPagamentos ? period.pagamentosTotalToPay : null}
        />
      )}

      {showPeriodChrome && period.hasDraft && (
        <p className="hint report-import-badge">
          Importação em pré-visualização ({period.importDraft?.fileName}) — confira as abas e clique em{" "}
          <strong>Salvar</strong> ao lado da semana.
        </p>
      )}

      {showPeriodChrome && !isPagamentos && (
        <PeriodHint
          start={period.periodStart}
          end={period.periodEnd}
          preset={period.preset}
          weekInfo={period.weekInfo}
        />
      )}

      <div
        className={`finance-content-area${showFreezeOverlay ? " finance-content-frozen" : ""}`}
      >
        <div className="tab-transition">
          <Outlet />
        </div>
        {showFreezeOverlay && (
          <div className="finance-freeze-overlay" role="status" aria-live="polite">
            <div className="finance-freeze-banner">CAIXA FECHADO</div>
          </div>
        )}
      </div>

      <FinanceImportModal />

      <Modal
        open={successOpen}
        title="Semana finalizada"
        onClose={() => setSuccessOpen(false)}
      >
        <div className="cash-closing-success">
          <p className="cash-closing-success-title">Semana finalizada com Sucesso</p>
          <p className="hint">
            O fechamento de caixa foi registrado. Novas vendas e multas ficam bloqueadas até o
            administrador reabrir o caixa, se necessário.
          </p>
          <div className="form-actions">
            <button type="button" className="btn btn-primary" onClick={() => setSuccessOpen(false)}>
              Entendi
            </button>
          </div>
        </div>
      </Modal>

      <Modal
        open={editRecoveryOpen}
        title="Edição em andamento"
        onClose={() => !discardingEdit && !savingReport && setEditRecoveryOpen(false)}
      >
        <div>
          <p>
            Este relatório está em edição e as alterações ainda não foram salvas. Ao sair sem salvar,
            o relatório voltará ao estado bloqueado e as mudanças não serão consolidadas no relatório
            da semana.
          </p>
          <div className="form-actions">
            <button
              type="button"
              className="btn btn-ghost"
              disabled={discardingEdit || savingReport}
              onClick={discardReportEdit}
            >
              {discardingEdit ? "Saindo..." : "Sair"}
            </button>
            <button
              type="button"
              className="btn btn-primary"
              disabled={discardingEdit || savingReport}
              onClick={handleRecoverySave}
            >
              Salvar
            </button>
          </div>
        </div>
      </Modal>

      <Modal
        open={saveReportOpen}
        title="Salvar relatório da semana"
        extraWide
        onClose={() => !savingReport && setSaveReportOpen(false)}
      >
        <SaveReportModal
          open={saveReportOpen}
          preview={saveReportPreview}
          loading={loadingSaveReport}
          saving={savingReport}
          onClose={() => setSaveReportOpen(false)}
          onConfirm={confirmSaveReport}
        />
      </Modal>
    </div>
  );
}

export default function FinanceLayout() {
  return (
    <FinancePeriodProvider>
      <CashClosingProvider>
        <FinanceLayoutInner />
      </CashClosingProvider>
    </FinancePeriodProvider>
  );
}
