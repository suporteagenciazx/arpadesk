/**
 * Validação manual: node frontend/src/lib/calendar.validate.mjs
 */
import {
  getOperationalWeekRange,
  getPresetRange,
  isOperationalWeekRange,
  parseLocalDate,
  toLocalIso,
} from "./calendar.js";

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

// Simula terça 16/06/2026 às 22h (horário em que UTC deslocava o dia)
const tueEvening = new Date(2026, 5, 16, 22, 30, 0);
const range = getOperationalWeekRange(tueEvening);
assert(range.start === "2026-06-15", `esperado 15/06, obteve ${range.start}`);
assert(range.end === "2026-06-19", `esperado 19/06, obteve ${range.end}`);

const preset = getPresetRange("atual", tueEvening);
assert(preset.start === "2026-06-15", `preset atual start: ${preset.start}`);
assert(preset.end === "2026-06-19", `preset atual end: ${preset.end}`);

// Sábado 20/06 ainda é a mesma semana civil (16–20)
const sat = new Date(2026, 5, 20, 10, 0, 0);
const satRange = getOperationalWeekRange(sat);
assert(satRange.start === "2026-06-15", `sábado start: ${satRange.start}`);
assert(satRange.end === "2026-06-19", `sábado end: ${satRange.end}`);

assert(isOperationalWeekRange("2026-06-15", "2026-06-19"), "deve ser semana operacional");
assert(!isOperationalWeekRange("2026-06-16", "2026-06-20"), "16–20 não é semana operacional");

// toLocalIso nunca deve usar UTC
const late = new Date(2026, 5, 15, 23, 0, 0);
assert(toLocalIso(late) === "2026-06-15", `toLocalIso tarde: ${toLocalIso(late)}`);

console.log("calendar.validate.mjs — OK");
console.log("  Semana atual (sim 16/06/2026):", range.start, "→", range.end);
