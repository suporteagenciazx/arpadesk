import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import api from "../lib/api";
import { useAuth } from "./AuthContext";
import { useFinancePeriod } from "./FinancePeriodContext";

const CashClosingContext = createContext(null);

export function CashClosingProvider({ children }) {
  const { projectId } = useParams();
  const { isAdmin } = useAuth();
  const period = useFinancePeriod();
  const [closing, setClosing] = useState(null);
  const [preview, setPreview] = useState(null);
  const [loading, setLoading] = useState(false);
  const [successOpen, setSuccessOpen] = useState(false);

  const isUnlocked = Boolean(closing?.reopened_at && closing?.reopen_scope === "all");
  const isCaixaFechado = Boolean(closing && !isUnlocked);
  const isReopened = isUnlocked;
  const isConfirmed = isCaixaFechado || isUnlocked;
  const isPendingAdmin = closing?.status === "pending_admin" && !isUnlocked;
  const frozen = Boolean(closing?.frozen_for_user);
  const tabsLocked = Boolean(closing?.report_tabs_locked && !isUnlocked);

  const refreshClosing = useCallback(async () => {
    if (!projectId || !period.periodStart || !period.periodEnd) {
      setClosing(null);
      return null;
    }
    try {
      const { data } = await api.get(`/api/projects/${projectId}/cash-closing`, {
        params: period.params(),
      });
      setClosing(data || null);
      return data || null;
    } catch {
      setClosing(null);
      return null;
    }
  }, [projectId, period.periodStart, period.periodEnd, period.params]);

  const loadPreview = useCallback(async () => {
    if (!projectId || !period.periodStart || !period.periodEnd) return null;
    setLoading(true);
    try {
      const { data } = await api.get(`/api/projects/${projectId}/cash-closing/preview`, {
        params: period.params(),
      });
      setPreview(data);
      return data;
    } finally {
      setLoading(false);
    }
  }, [projectId, period.periodStart, period.periodEnd, period.params]);

  const submitClosing = useCallback(async (clientsReceived) => {
    let body = {};
    if (clientsReceived != null && clientsReceived !== "") {
      const parsed = parseInt(clientsReceived, 10);
      if (!Number.isNaN(parsed) && parsed >= 0) {
        body = { clients_received: parsed };
      }
    }
    const { data } = await api.post(`/api/projects/${projectId}/cash-closing`, body, {
      params: period.params(),
    });
    setClosing(data);
    if (!isAdmin) {
      setSuccessOpen(true);
    }
    return data;
  }, [projectId, period.params, isAdmin]);

  const confirmClosing = useCallback(async () => {
    const { data } = await api.post(`/api/projects/${projectId}/cash-closing/confirm`, null, {
      params: period.params(),
    });
    setClosing(data);
    return data;
  }, [projectId, period.params]);

  const cancelClosing = useCallback(async () => {
    await api.post(`/api/projects/${projectId}/cash-closing/cancel`, null, {
      params: period.params(),
    });
    setClosing(null);
  }, [projectId, period.params]);

  const unlockCashClosing = useCallback(async () => {
    const { data } = await api.post(`/api/projects/${projectId}/cash-closing/unlock`, null, {
      params: period.params(),
    });
    setClosing(data);
    return data;
  }, [projectId, period.params]);

  useEffect(() => {
    refreshClosing();
  }, [refreshClosing, period.reloadToken]);

  return (
    <CashClosingContext.Provider
      value={{
        closing,
        preview,
        loading,
        frozen,
        tabsLocked,
        successOpen,
        setSuccessOpen,
        refreshClosing,
        loadPreview,
        submitClosing,
        confirmClosing,
        cancelClosing,
        unlockCashClosing,
        isPendingAdmin,
        isConfirmed,
        isReopened,
        isCaixaFechado,
        isUnlocked,
      }}
    >
      {children}
    </CashClosingContext.Provider>
  );
}

export function useCashClosing() {
  const ctx = useContext(CashClosingContext);
  if (!ctx) {
    throw new Error("useCashClosing deve ser usado dentro de CashClosingProvider");
  }
  return ctx;
}
