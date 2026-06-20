/**
 * Módulo único de calendário — semana operacional (segunda a sexta).
 * Sempre use toLocalIso / parseLocalDate; nunca toISOString() para filtros de dia.
 */

export const DATE_PRESETS = [
  { id: "atual", label: "Atual" },
  { id: "today", label: "Hoje" },
  { id: "7d", label: "Últimos 7 dias" },
  { id: "15d", label: "Últimos 15 dias" },
  { id: "month", label: "Mês" },
  { id: "6m", label: "Últimos 6 meses" },
  { id: "custom", label: "Personalizado" },
];

/** Meio-dia local evita mudança de dia em UTC e bordas de horário de verão. */
export function startOfDay(date) {
  const d = new Date(date);
  d.setHours(12, 0, 0, 0);
  return d;
}

/** Data civil local em YYYY-MM-DD (fuso do navegador). */
export function toLocalIso(date) {
  const d = startOfDay(date);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function parseLocalDate(iso) {
  if (!iso) return null;
  const [y, m, d] = iso.split("-").map(Number);
  return startOfDay(new Date(y, m - 1, d));
}

export function addDays(date, days) {
  const d = startOfDay(date);
  d.setDate(d.getDate() + days);
  return d;
}

/** Segunda-feira da semana civil ISO (semana começa na segunda). */
export function getMondayOfWeek(refDate = new Date()) {
  const d = startOfDay(refDate);
  const w = d.getDay(); // 0=dom … 6=sáb
  const diff = w === 0 ? -6 : 1 - w;
  return addDays(d, diff);
}

/** Semana operacional: segunda a sexta da semana civil que contém refDate. */
export function getOperationalWeekRange(refDate = new Date()) {
  const monday = getMondayOfWeek(refDate);
  const friday = addDays(monday, 4);
  return { start: toLocalIso(monday), end: toLocalIso(friday) };
}

export function shiftOperationalWeek(startIso, endIso, weeksDelta) {
  const start = parseLocalDate(startIso);
  const end = parseLocalDate(endIso);
  return {
    start: toLocalIso(addDays(start, weeksDelta * 7)),
    end: toLocalIso(addDays(end, weeksDelta * 7)),
  };
}

export function isOperationalWeekRange(startIso, endIso) {
  if (!startIso || !endIso) return false;
  const start = parseLocalDate(startIso);
  const end = parseLocalDate(endIso);
  if (start.getDay() !== 1 || end.getDay() !== 5) return false;
  const diffDays = Math.round((end - start) / 86400000);
  return diffDays === 4;
}

/** Número da semana ISO 8601 (segunda = início da semana). */
export function getISOWeekNumber(refDate) {
  const d = startOfDay(refDate);
  d.setDate(d.getDate() + 3 - ((d.getDay() + 6) % 7));
  const week1 = startOfDay(new Date(d.getFullYear(), 0, 4));
  return (
    1 +
    Math.round(((d - week1) / 86400000 - 3 + ((week1.getDay() + 6) % 7)) / 7)
  );
}

export function formatWeekInfo(startIso, endIso) {
  if (!startIso || !endIso) return null;
  const start = parseLocalDate(startIso);
  const week = getISOWeekNumber(start);
  const year = start.getFullYear();
  return {
    week,
    year,
    label: `Semana ${week}/${year}`,
    isOperational: isOperationalWeekRange(startIso, endIso),
  };
}

export function todayLocalIso() {
  return toLocalIso(new Date());
}

export function getPresetRange(preset, refDate = new Date()) {
  const today = startOfDay(refDate);
  const end = toLocalIso(today);

  switch (preset) {
    case "atual":
      return getOperationalWeekRange(today);
    case "today":
      return { start: end, end };
    case "7d":
      return { start: toLocalIso(addDays(today, -6)), end };
    case "15d":
      return { start: toLocalIso(addDays(today, -14)), end };
    case "month": {
      const start = new Date(today.getFullYear(), today.getMonth(), 1, 12, 0, 0, 0);
      return { start: toLocalIso(start), end };
    }
    case "6m": {
      const start = new Date(today.getFullYear(), today.getMonth() - 6, today.getDate(), 12, 0, 0, 0);
      return { start: toLocalIso(start), end };
    }
    default:
      return { start: "", end: "" };
  }
}

/** Período exibido é a semana operacional atual (preset «Atual»). */
export function isCurrentOperationalPeriod(periodStart, periodEnd) {
  const atual = getPresetRange("atual");
  return periodStart === atual.start && periodEnd === atual.end;
}

/** Fechamento de caixa: seg–sex até 20h da sexta (horário local). */
export function isCashClosingAvailable(refDate = new Date()) {
  const day = refDate.getDay();
  if (day === 0 || day === 6) return false;
  if (day === 5) return refDate.getHours() < 20;
  return true;
}
