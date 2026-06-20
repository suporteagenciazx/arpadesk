import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { postMultipart } from "../lib/api";
import {
  getPresetRange,
  formatWeekInfo,
  shiftOperationalWeek,
  isCurrentOperationalPeriod,
} from "../lib/calendar";
import { canFullHistory } from "../lib/privileges";
import { useAuth } from "./AuthContext";
import { useToast } from "./ToastContext";

const FinancePeriodContext = createContext(null);

function storageKey(projectId) {
  return `arpadesk_finance_period_${projectId}`;
}

function loadPersisted(projectId) {
  if (!projectId) return null;
  try {
    const raw = sessionStorage.getItem(storageKey(projectId));
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function savePersisted(projectId, data) {
  if (!projectId) return;
  try {
    sessionStorage.setItem(storageKey(projectId), JSON.stringify(data));
  } catch {
    /* quota / private mode */
  }
}

function currentOperationalRange() {
  return getPresetRange("atual");
}

export function FinancePeriodProvider({ children }) {
  const { projectId } = useParams();
  const { user, isAdmin } = useAuth();
  const { notify } = useToast();
  const hasFullHistory = canFullHistory(user);
  const fallback = currentOperationalRange();
  const periodBeforeDraftRef = useRef(null);

  const [preset, setPreset] = useState("atual");
  const [navWeekStart, setNavWeekStart] = useState(fallback.start);
  const [navWeekEnd, setNavWeekEnd] = useState(fallback.end);
  const [periodStart, setPeriodStart] = useState(fallback.start);
  const [periodEnd, setPeriodEnd] = useState(fallback.end);
  const [importDraft, setImportDraft] = useState(null);
  const [importModalOpen, setImportModalOpen] = useState(false);
  const [importing, setImporting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [reloadToken, setReloadToken] = useState(0);
  const [pagamentosTotalToPay, setPagamentosTotalToPay] = useState(null);

  const applyCurrentOperationalWeek = useCallback(() => {
    const range = currentOperationalRange();
    setPreset("atual");
    setNavWeekStart(range.start);
    setNavWeekEnd(range.end);
    setPeriodStart(range.start);
    setPeriodEnd(range.end);
    setImportDraft(null);
    periodBeforeDraftRef.current = null;
  }, []);

  useEffect(() => {
    if (!projectId) return;

    if (!hasFullHistory) {
      applyCurrentOperationalWeek();
      return;
    }

    const saved = loadPersisted(projectId);
    if (saved) {
      setPreset(saved.preset ?? "atual");
      setNavWeekStart(saved.navWeekStart ?? saved.periodStart ?? fallback.start);
      setNavWeekEnd(saved.navWeekEnd ?? saved.periodEnd ?? fallback.end);
      setPeriodStart(saved.periodStart ?? fallback.start);
      setPeriodEnd(saved.periodEnd ?? fallback.end);
      setImportDraft(saved.importDraft ?? null);
    } else {
      applyCurrentOperationalWeek();
    }
    periodBeforeDraftRef.current = null;
  }, [projectId, user?.id, hasFullHistory, applyCurrentOperationalWeek]);

  useEffect(() => {
    if (!hasFullHistory || !projectId) return;
    savePersisted(projectId, {
      preset,
      navWeekStart,
      navWeekEnd,
      periodStart,
      periodEnd,
      importDraft,
    });
  }, [projectId, preset, navWeekStart, navWeekEnd, periodStart, periodEnd, importDraft, hasFullHistory]);

  const hasDraft = Boolean(importDraft);
  const effectivePeriodStart = importDraft?.periodStart ?? periodStart;
  const effectivePeriodEnd = importDraft?.periodEnd ?? periodEnd;
  const basePreset = preset;

  const isViewingCurrentWeek = isCurrentOperationalPeriod(effectivePeriodStart, effectivePeriodEnd);
  const weekNavActive = !hasDraft && basePreset === "atual" && hasFullHistory;
  const isActionPeriod =
    !hasDraft && basePreset === "atual" && (hasFullHistory || isViewingCurrentWeek);

  const setPeriodRange = useCallback(
    (start, end) => {
      if (importDraft || !hasFullHistory) return;
      setPreset("custom");
      setPeriodStart(start);
      setPeriodEnd(end);
    },
    [importDraft, hasFullHistory]
  );

  const applyPreset = useCallback(
    (id) => {
      if (importDraft) return;
      if (!hasFullHistory && id !== "atual") return;
      setPreset(id);
      if (id === "custom") return;
      if (id === "atual") {
        setPeriodStart(navWeekStart);
        setPeriodEnd(navWeekEnd);
        return;
      }
      const range = getPresetRange(id);
      setPeriodStart(range.start);
      setPeriodEnd(range.end);
    },
    [importDraft, hasFullHistory, navWeekStart, navWeekEnd]
  );

  const shiftWeek = useCallback(
    (weeksDelta) => {
      if (importDraft || basePreset !== "atual" || !hasFullHistory) {
        return { start: effectivePeriodStart, end: effectivePeriodEnd };
      }
      const range = shiftOperationalWeek(navWeekStart, navWeekEnd, weeksDelta);
      setNavWeekStart(range.start);
      setNavWeekEnd(range.end);
      setPeriodStart(range.start);
      setPeriodEnd(range.end);
      return range;
    },
    [importDraft, basePreset, hasFullHistory, navWeekStart, navWeekEnd, effectivePeriodStart, effectivePeriodEnd]
  );

  const weekInfo = useMemo(
    () => (weekNavActive || (basePreset === "atual" && !hasDraft) ? formatWeekInfo(effectivePeriodStart, effectivePeriodEnd) : null),
    [weekNavActive, basePreset, hasDraft, effectivePeriodStart, effectivePeriodEnd]
  );

  const params = useCallback(() => {
    const p = {};
    if (effectivePeriodStart) p.period_start = effectivePeriodStart;
    if (effectivePeriodEnd) p.period_end = effectivePeriodEnd;
    return p;
  }, [effectivePeriodStart, effectivePeriodEnd]);

  const draftMatchesPeriod = Boolean(importDraft);

  const discardDraft = useCallback(() => {
    const prev = periodBeforeDraftRef.current;
    if (prev && hasFullHistory) {
      setPreset(prev.preset);
      setPeriodStart(prev.periodStart);
      setPeriodEnd(prev.periodEnd);
      if (prev.navWeekStart) setNavWeekStart(prev.navWeekStart);
      if (prev.navWeekEnd) setNavWeekEnd(prev.navWeekEnd);
      periodBeforeDraftRef.current = null;
    } else {
      applyCurrentOperationalWeek();
    }
    setImportDraft(null);
    setReloadToken((t) => t + 1);
  }, [hasFullHistory, applyCurrentOperationalWeek]);

  const parseImport = useCallback(
    async (file, start, end) => {
      if (!file || !start || !end) {
        notify("Informe o período e selecione um PDF.", "error");
        return false;
      }
      setImporting(true);
      try {
        const fd = new FormData();
        fd.append("period_start", start);
        fd.append("period_end", end);
        fd.append("file", file);
        const { data } = await postMultipart(`/api/projects/${projectId}/report-imports/parse`, fd);
        periodBeforeDraftRef.current = { preset, periodStart, periodEnd, navWeekStart, navWeekEnd };
        setPreset("custom");
        setPeriodStart(start);
        setPeriodEnd(end);
        setImportDraft({
          stagingId: data.staging_id,
          periodStart: start,
          periodEnd: end,
          fileName: data.original_filename || file.name,
          parseStatus: data.parse_status,
          preview: data.preview,
          extracted: data.extracted_data,
        });
        setImportModalOpen(false);
        if (data.parse_status === "empty") {
          notify("PDF lido, mas nenhum dado foi reconhecido.", "warning");
        } else {
          notify("Pré-visualização pronta — confira as abas e clique em Salvar.", "success");
        }
        return true;
      } catch (err) {
        notify(err.response?.data?.detail || "Erro ao importar PDF", "error");
        return false;
      } finally {
        setImporting(false);
      }
    },
    [projectId, preset, periodStart, periodEnd, navWeekStart, navWeekEnd, notify]
  );

  const commitImport = useCallback(async () => {
    if (!importDraft) return false;
    setSaving(true);
    try {
      const fd = new FormData();
      fd.append("period_start", importDraft.periodStart);
      fd.append("period_end", importDraft.periodEnd);
      fd.append("staging_id", importDraft.stagingId);
      fd.append("original_filename", importDraft.fileName || "");
      await postMultipart(`/api/projects/${projectId}/report-imports/commit`, fd);
      periodBeforeDraftRef.current = null;
      setImportDraft(null);
      setReloadToken((t) => t + 1);
      notify("Relatório salvo com sucesso.", "success");
      return true;
    } catch (err) {
      notify(err.response?.data?.detail || "Erro ao salvar importação", "error");
      return false;
    } finally {
      setSaving(false);
    }
  }, [importDraft, projectId, notify]);

  const openPeriodForEdit = useCallback((start, end) => {
    periodBeforeDraftRef.current = null;
    setImportDraft(null);
    setPreset("atual");
    setNavWeekStart(start);
    setNavWeekEnd(end);
    setPeriodStart(start);
    setPeriodEnd(end);
    setReloadToken((t) => t + 1);
  }, []);

  const value = {
    preset: hasDraft ? "custom" : preset,
    basePreset,
    periodStart: effectivePeriodStart,
    periodEnd: effectivePeriodEnd,
    setPeriodStart,
    setPeriodEnd,
    setPeriodRange,
    applyPreset,
    shiftWeek,
    weekInfo,
    weekNavActive,
    isActionPeriod,
    hasFullHistory,
    isViewingCurrentWeek,
    params,
    importDraft,
    hasDraft,
    draftMatchesPeriod,
    filtersLocked: hasDraft,
    importModalOpen,
    setImportModalOpen,
    importing,
    saving,
    parseImport,
    commitImport,
    discardDraft,
    reloadToken,
    bumpReload: () => setReloadToken((t) => t + 1),
    openPeriodForEdit,
    pagamentosTotalToPay,
    setPagamentosTotalToPay,
  };

  return <FinancePeriodContext.Provider value={value}>{children}</FinancePeriodContext.Provider>;
}

export function useFinancePeriod() {
  const ctx = useContext(FinancePeriodContext);
  if (!ctx) {
    throw new Error("useFinancePeriod deve ser usado dentro de FinancePeriodProvider");
  }
  return ctx;
}

export function useImportPreviewData(apiData, key) {
  const { importDraft, hasDraft } = useFinancePeriod();
  if (hasDraft && importDraft?.preview?.[key]) {
    return importDraft.preview[key];
  }
  return apiData;
}

export function useImportPreviewSummary(apiSummary) {
  const { importDraft, hasDraft } = useFinancePeriod();
  if (hasDraft && importDraft?.preview?.summary) {
    return importDraft.preview.summary;
  }
  return apiSummary;
}
