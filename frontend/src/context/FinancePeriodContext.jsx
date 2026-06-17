import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { postMultipart } from "../lib/api";
import { getPresetRange, formatWeekInfo, isOperationalWeekRange, shiftOperationalWeek } from "../lib/calendar";
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

export function FinancePeriodProvider({ children }) {
  const { projectId } = useParams();
  const { notify } = useToast();
  const persisted = useMemo(() => loadPersisted(projectId), [projectId]);
  const fallback = getPresetRange("atual");
  const periodBeforeDraftRef = useRef(null);

  const [preset, setPreset] = useState(persisted?.preset ?? "atual");
  const [periodStart, setPeriodStart] = useState(persisted?.periodStart ?? fallback.start);
  const [periodEnd, setPeriodEnd] = useState(persisted?.periodEnd ?? fallback.end);
  const [importDraft, setImportDraft] = useState(persisted?.importDraft ?? null);
  const [importModalOpen, setImportModalOpen] = useState(false);
  const [importing, setImporting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [reloadToken, setReloadToken] = useState(0);
  const [pagamentosTotalToPay, setPagamentosTotalToPay] = useState(null);

  useEffect(() => {
    const saved = loadPersisted(projectId);
    if (saved) {
      setPreset(saved.preset ?? "atual");
      setPeriodStart(saved.periodStart ?? fallback.start);
      setPeriodEnd(saved.periodEnd ?? fallback.end);
      setImportDraft(saved.importDraft ?? null);
    } else {
      const range = getPresetRange("atual");
      setPreset("atual");
      setPeriodStart(range.start);
      setPeriodEnd(range.end);
      setImportDraft(null);
    }
    periodBeforeDraftRef.current = null;
  }, [projectId]);

  useEffect(() => {
    savePersisted(projectId, {
      preset,
      periodStart,
      periodEnd,
      importDraft,
    });
  }, [projectId, preset, periodStart, periodEnd, importDraft]);

  const hasDraft = Boolean(importDraft);
  const effectivePeriodStart = importDraft?.periodStart ?? periodStart;
  const effectivePeriodEnd = importDraft?.periodEnd ?? periodEnd;

  const setPeriodRange = useCallback(
    (start, end) => {
      if (importDraft) return;
      setPreset("custom");
      setPeriodStart(start);
      setPeriodEnd(end);
    },
    [importDraft]
  );

  const applyPreset = useCallback(
    (id, onRange) => {
      if (importDraft) return;
      setPreset(id);
      if (id === "custom") return;
      const range = getPresetRange(id);
      setPeriodStart(range.start);
      setPeriodEnd(range.end);
      onRange?.(range.start, range.end);
    },
    [importDraft]
  );

  const shiftWeek = useCallback(
    (weeksDelta) => {
      if (importDraft) {
        return { start: effectivePeriodStart, end: effectivePeriodEnd };
      }
      const range = shiftOperationalWeek(periodStart, periodEnd, weeksDelta);
      setPeriodStart(range.start);
      setPeriodEnd(range.end);
      if (preset === "atual") setPreset("custom");
      return range;
    },
    [importDraft, periodStart, periodEnd, preset, effectivePeriodStart, effectivePeriodEnd]
  );

  const weekInfo = useMemo(
    () => formatWeekInfo(effectivePeriodStart, effectivePeriodEnd),
    [effectivePeriodStart, effectivePeriodEnd]
  );

  const showWeekNav = useMemo(
    () => isOperationalWeekRange(effectivePeriodStart, effectivePeriodEnd),
    [effectivePeriodStart, effectivePeriodEnd]
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
    if (prev) {
      setPreset(prev.preset);
      setPeriodStart(prev.periodStart);
      setPeriodEnd(prev.periodEnd);
      periodBeforeDraftRef.current = null;
    }
    setImportDraft(null);
    setReloadToken((t) => t + 1);
  }, []);

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
        periodBeforeDraftRef.current = { preset, periodStart, periodEnd };
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
    [projectId, preset, periodStart, periodEnd, notify]
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

  const value = {
    preset: hasDraft ? "custom" : preset,
    periodStart: effectivePeriodStart,
    periodEnd: effectivePeriodEnd,
    setPeriodStart,
    setPeriodEnd,
    setPeriodRange,
    applyPreset,
    shiftWeek,
    weekInfo,
    showWeekNav,
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
