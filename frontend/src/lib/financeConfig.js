/** Configurações financeiras do projeto — espelha backend/project_finance_config.py */

import { addDays, getMondayOfWeek, parseLocalDate, toLocalIso, getOperationalWeekRange } from "./calendar";

export { getOperationalWeekRange };

export const WEEKDAY_OPTIONS = [
  { value: 1, label: "Segunda-feira" },
  { value: 2, label: "Terça-feira" },
  { value: 3, label: "Quarta-feira" },
  { value: 4, label: "Quinta-feira" },
  { value: 5, label: "Sexta-feira" },
];

export const CLOSING_MODE_OPTIONS = [
  { value: "manual", label: "Manual (privilégio de fechamento)" },
  { value: "automatic", label: "Automático no horário" },
  { value: "both", label: "Manual e automático" },
];

export const BONUS_RULE_TYPES = [
  {
    value: "sale_milestone",
    label: "Venda que completa a meta",
    hint: "Quem registrar a venda que atingir o valor (ex.: 20 mil) recebe o bônus.",
  },
  {
    value: "user_threshold",
    label: "Meta individual",
    hint: "Colaborador que atingir o valor no período (dia, semana ou mês).",
  },
  {
    value: "general_billing",
    label: "Bônus geral por faturamento",
    hint: "Valor fixo para todos ou selecionados quando o faturamento do período atingir a meta.",
  },
];

export const BONUS_PERIOD_OPTIONS = [
  { value: "sale", label: "Por venda" },
  { value: "day", label: "Dia" },
  { value: "week", label: "Semana" },
  { value: "month", label: "Mês" },
];

export const REWARD_TYPE_OPTIONS = [
  { value: "fixed", label: "Valor fixo (R$)" },
  { value: "percent", label: "Percentual (%)" },
];

export const DEFAULT_FINANCE_CONFIG = {
  closing_schedule: {
    weekly: {
      default_weekday: 5,
      default_time: "20:00",
      mode: "both",
      current_week: null,
    },
    daily: {
      enabled: false,
      time: "20:00",
      mode: "manual",
    },
  },
  bonus_rules: [],
};

export function mergeFinanceConfig(settings) {
  const raw = settings?.finance_config || {};
  const weekly = raw.closing_schedule?.weekly || {};
  const daily = raw.closing_schedule?.daily || {};
  return {
    closing_schedule: {
      weekly: {
        ...DEFAULT_FINANCE_CONFIG.closing_schedule.weekly,
        ...weekly,
      },
      daily: {
        ...DEFAULT_FINANCE_CONFIG.closing_schedule.daily,
        ...daily,
      },
    },
    bonus_rules: Array.isArray(raw.bonus_rules) ? raw.bonus_rules : [],
  };
}

export function weeklyClosingTime(financeConfig) {
  const weekly = financeConfig?.closing_schedule?.weekly;
  return weekly?.current_week?.closing_time || weekly?.default_time || "20:00";
}

export function isManualClosingAllowed(financeConfig) {
  const mode = financeConfig?.closing_schedule?.weekly?.mode ?? "both";
  return mode === "manual" || mode === "both";
}

export function isWithinManualClosingWindow(financeConfig, refDate = new Date()) {
  const range = getOperationalWeekRange(refDate, financeConfig);
  const today = toLocalIso(refDate);
  if (today < range.start) return false;
  const closingTime = weeklyClosingTime(financeConfig);
  const [h, m] = closingTime.split(":").map(Number);
  if (today < range.end) return false;
  if (today > range.end) return true;
  const nowH = refDate.getHours();
  const nowM = refDate.getMinutes();
  return nowH > h || (nowH === h && nowM >= m);
}

export function emptyBonusRule() {
  const id =
    typeof crypto !== "undefined" && crypto.randomUUID
      ? crypto.randomUUID()
      : `rule-${Date.now()}`;
  return {
    id,
    name: "",
    enabled: true,
    rule_type: "user_threshold",
    period: "week",
    threshold_amount: 0,
    reward_type: "fixed",
    reward_value: 0,
    participant_ids: [],
    description: "",
  };
}

export function buildCurrentWeekOverride(periodStart, periodEnd, closingTime) {
  if (!periodStart || !periodEnd) return null;
  return {
    period_start: periodStart,
    period_end: periodEnd,
    closing_time: closingTime || "20:00",
  };
}

export function weekdayLabel(value) {
  return WEEKDAY_OPTIONS.find((o) => o.value === value)?.label || "—";
}
