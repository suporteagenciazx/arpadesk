import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import api, { postMultipart } from "../lib/api";
import {
  getPresetRange,
  formatWeekInfo,
  shiftOperationalWeek,
  isCurrentOperationalPeriod,
  todayLocalIso,
} from "../lib/calendar";
import { mergeFinanceConfig } from "../lib/financeConfig";
import { canFullHistory } from "../lib/privileges";
import { useAuth } from "./AuthContext";
import { useProject } from "./ProjectContext";
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

function currentOperationalRange(financeConfig) {
  return getPresetRange("atual", new Date(), financeConfig);
}

export function FinancePeriodProvider({ children }) {
  const { projectId } = useParams();
  const { project } = useProject();
  const financeConfig = useMemo(() => mergeFinanceConfig(project?.settings), [project?.settings]);
  const { user } = useAuth();
  const { notify } = useToast();
  const hasFullHistory = canFullHistory(user);
  const fallback = useMemo(() => currentOperationalRange(financeConfig), [financeConfig]);
  const periodBeforeDraftRef = useRef(null);
  const browsingHistoryRef = useRef(false);
  const initializedProjectRef = useRef(null);

  const [preset, setPreset] = useState("atual");
  const [navWeekStart, setNavWeekStart] = useState(fallback.start);
  const [navWeekEnd, setNavWeekEnd] = useState(fallback.end);
  const [periodStart, setPeriodStart] = useState(fallback.start);
  const [periodEnd, setPeriodEnd] = useState(fallback.end);
  const [activePeriod, setActivePeriod] = useState(null);
  const [importDraft, setImportDraft] = useState(null);
  const [importModalOpen, setImportModalOpen] = useState(false);
  const [importing, setImporting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [reloadToken, setReloadToken] = useState(0);
  const [pagamentosTotalToPay, setPagamentosTotalToPay] = useState(null);

  const persistPeriodState = useCallback(
    (overrides = {}) => {
      if (!projectId || !hasFullHistory) return;
      savePersisted(projectId, {
        preset: overrides.preset ?? preset,
        browsingHistory: overrides.browsingHistory ?? browsingHistoryRef.current,
        navWeekStart: overrides.navWeekStart ?? navWeekStart,
        navWeekEnd: overrides.navWeekEnd ?? navWeekEnd,
        periodStart: overrides.periodStart ?? periodStart,
        periodEnd: overrides.periodEnd ?? periodEnd,
        importDraft: overrides.importDraft !== undefined ? overrides.importDraft : importDraft,
      });
    },
    [projectId, hasFullHistory, preset, navWeekStart, navWeekEnd, periodStart, periodEnd, importDraft]
  );

  const applyActivePeriodRange = useCallback(
    (start, end, apiActive = null) => {
      if (!start || !end) return;
      browsingHistoryRef.current = false;
      setPreset("atual");
      setNavWeekStart(start);
      setNavWeekEnd(end);
      setPeriodStart(start);
      setPeriodEnd(end);
      if (apiActive) {
        setActivePeriod(apiActive);
      } else {
        setActivePeriod((prev) => ({
          ...(prev || {}),
          period_start: start,
          period_end: end,
          week_open_for_team: todayLocalIso() >= start,
          next_opening_date: todayLocalIso() >= start ? null : start,
        }));
      }
      setImportDraft(null);
      periodBeforeDraftRef.current = null;
      if (projectId && hasFullHistory) {
        savePersisted(projectId, {
          preset: "atual",
          browsingHistory: false,
          navWeekStart: start,
          navWeekEnd: end,
          periodStart: start,
          periodEnd: end,
          importDraft: null,
        });
      }
    },
    [projectId, hasFullHistory]
  );

  const applyCurrentOperationalWeek = useCallback(() => {
    if (activePeriod?.period_start && activePeriod?.period_end) {
      applyActivePeriodRange(activePeriod.period_start, activePeriod.period_end, activePeriod);
      return;
    }
    const range = currentOperationalRange(financeConfig);
    browsingHistoryRef.current = false;
    setPreset("atual");
    setNavWeekStart(range.start);
    setNavWeekEnd(range.end);
    setPeriodStart(range.start);
    setPeriodEnd(range.end);
    setImportDraft(null);
    periodBeforeDraftRef.current = null;
  }, [financeConfig, activePeriod, applyActivePeriodRange]);

  const refreshActivePeriod = useCallback(async () => {
    if (!projectId) return null;
    try {
      const { data } = await api.get(`/api/projects/${projectId}/active-period`);
      setActivePeriod(data);
      return data;
    } catch {
      return null;
    }
  }, [projectId]);

  useEffect(() => {
    if (!projectId) return;
    refreshActivePeriod();
  }, [projectId, reloadToken, refreshActivePeriod]);

  useEffect(() => {
    if (!projectId || hasFullHistory) return undefined;
    const sync = () => refreshActivePeriod();
    const interval = setInterval(sync, 30000);
    window.addEventListener("focus", sync);
    return () => {
      clearInterval(interval);
      window.removeEventListener("focus", sync);
    };
  }, [projectId, hasFullHistory, refreshActivePeriod]);

  useEffect(() => {
    if (!projectId) return;
    if (initializedProjectRef.current === projectId) return;
    initializedProjectRef.current = projectId;
    browsingHistoryRef.current = false;

    if (!hasFullHistory) {
      return;
    }

    const saved = loadPersisted(projectId);
    if (saved?.preset && saved.preset !== "atual") {
      setPreset(saved.preset);
      setNavWeekStart(saved.navWeekStart ?? saved.periodStart ?? fallback.start);
      setNavWeekEnd(saved.navWeekEnd ?? saved.periodEnd ?? fallback.end);
      setPeriodStart(saved.periodStart ?? fallback.start);
      setPeriodEnd(saved.periodEnd ?? fallback.end);
      setImportDraft(saved.importDraft ?? null);
      browsingHistoryRef.current = false;
      return;
    }

    if (saved?.browsingHistory && saved.periodStart && saved.periodEnd) {
      browsingHistoryRef.current = true;
      setPreset("atual");
      setNavWeekStart(saved.navWeekStart ?? saved.periodStart);
      setNavWeekEnd(saved.navWeekEnd ?? saved.periodEnd);
      setPeriodStart(saved.periodStart);
      setPeriodEnd(saved.periodEnd);
      setImportDraft(saved.importDraft ?? null);
      return;
    }

    setPreset("atual");
  }, [projectId, hasFullHistory, fallback.start, fallback.end]);

  useEffect(() => {
    if (!projectId || !activePeriod?.period_start || !activePeriod?.period_end) return;

    const needsSync =
      periodStart !== activePeriod.period_start || periodEnd !== activePeriod.period_end;

    if (!hasFullHistory) {
      if (needsSync) {
        applyActivePeriodRange(activePeriod.period_start, activePeriod.period_end, activePeriod);
      }
      return;
    }

    if (preset === "atual" && !browsingHistoryRef.current && needsSync) {
      applyActivePeriodRange(activePeriod.period_start, activePeriod.period_end, activePeriod);
    }
  }, [
    projectId,
    activePeriod,
    hasFullHistory,
    preset,
    periodStart,
    periodEnd,
    applyActivePeriodRange,
  ]);

  useEffect(() => {
    if (!hasFullHistory || !projectId) return;
    if (preset === "atual" && !browsingHistoryRef.current) return;
    persistPeriodState();
  }, [projectId, preset, navWeekStart, navWeekEnd, periodStart, periodEnd, importDraft, hasFullHistory, persistPeriodState]);

  const hasDraft = Boolean(importDraft);
  const effectivePeriodStart = importDraft?.periodStart ?? periodStart;
  const effectivePeriodEnd = importDraft?.periodEnd ?? periodEnd;
  const basePreset = preset;

  const isViewingActivePeriod = useMemo(() => {
    if (activePeriod?.period_start && activePeriod?.period_end) {
      return (
        effectivePeriodStart === activePeriod.period_start &&
        effectivePeriodEnd === activePeriod.period_end
      );
    }
    return isCurrentOperationalPeriod(effectivePeriodStart, effectivePeriodEnd, financeConfig);
  }, [activePeriod, effectivePeriodStart, effectivePeriodEnd, financeConfig]);

  const isTeamWeekOpen = useMemo(() => {
    if (activePeriod?.week_open_for_team === false) return false;
    const openDate = activePeriod?.period_start || effectivePeriodStart;
    if (!openDate) return true;
    return todayLocalIso() >= openDate;
  }, [activePeriod, effectivePeriodStart]);

  const weekNavActive = !hasDraft && basePreset === "atual" && hasFullHistory;
  const isActionPeriod =
    !hasDraft &&
    basePreset === "atual" &&
    (hasFullHistory || (isViewingActivePeriod && isTeamWeekOpen));

  const setPeriodRange = useCallback(
    (start, end) => {
      if (importDraft || !hasFullHistory) return;
      browsingHistoryRef.current = true;
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
        if (activePeriod?.period_start && activePeriod?.period_end) {
          applyActivePeriodRange(activePeriod.period_start, activePeriod.period_end, activePeriod);
        } else {
          browsingHistoryRef.current = false;
          setPeriodStart(navWeekStart);
          setPeriodEnd(navWeekEnd);
        }
        return;
      }
      browsingHistoryRef.current = true;
      const range = getPresetRange(id);
      setPeriodStart(range.start);
      setPeriodEnd(range.end);
    },
    [importDraft, hasFullHistory, navWeekStart, navWeekEnd, activePeriod, applyActivePeriodRange]
  );

  const shiftWeek = useCallback(
    (weeksDelta) => {
      if (importDraft || basePreset !== "atual" || !hasFullHistory) {
        return { start: effectivePeriodStart, end: effectivePeriodEnd };
      }
      browsingHistoryRef.current = true;
      const range = shiftOperationalWeek(navWeekStart, navWeekEnd, weeksDelta);
      setNavWeekStart(range.start);
      setNavWeekEnd(range.end);
      setPeriodStart(range.start);
      setPeriodEnd(range.end);
      if (projectId) {
        savePersisted(projectId, {
          preset: "atual",
          browsingHistory: true,
          navWeekStart: range.start,
          navWeekEnd: range.end,
          periodStart: range.start,
          periodEnd: range.end,
          importDraft: null,
        });
      }
      return range;
    },
    [importDraft, basePreset, hasFullHistory, navWeekStart, navWeekEnd, effectivePeriodStart, effectivePeriodEnd, projectId]
  );

  const weekInfo = useMemo(
    () =>
      weekNavActive || (basePreset === "atual" && !hasDraft)
        ? formatWeekInfo(effectivePeriodStart, effectivePeriodEnd)
        : null,
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
      browsingHistoryRef.current = Boolean(prev.browsingHistory);
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
        periodBeforeDraftRef.current = {
          preset,
          periodStart,
          periodEnd,
          navWeekStart,
          navWeekEnd,
          browsingHistory: browsingHistoryRef.current,
        };
        browsingHistoryRef.current = true;
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
    browsingHistoryRef.current = true;
    setImportDraft(null);
    setPreset("atual");
    setNavWeekStart(start);
    setNavWeekEnd(end);
    setPeriodStart(start);
    setPeriodEnd(end);
    if (projectId && hasFullHistory) {
      savePersisted(projectId, {
        preset: "atual",
        browsingHistory: true,
        navWeekStart: start,
        navWeekEnd: end,
        periodStart: start,
        periodEnd: end,
        importDraft: null,
      });
    }
    setReloadToken((t) => t + 1);
  }, [projectId, hasFullHistory]);

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
    isViewingActivePeriod,
    isTeamWeekOpen,
    activePeriod,
    refreshActivePeriod,
    applyActivePeriodRange,
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
