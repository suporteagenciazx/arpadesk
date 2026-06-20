import { canFullHistory } from "./privileges";

const ALL_TAB_KEYS = ["vendas", "pagamentos", "despesas", "comissoes", "relatorio", "arquivo"];

/** Contador: apenas Vendas. Financeiro: Vendas + Pagamentos. Admin: tudo. */
export function canAccessFinanceTab(level, tab) {
  if (!level) return false;
  if (level === "admin") return true;
  if (level === "financeiro") return tab === "vendas";
  if (level === "contador" || level === "agente") return tab === "vendas";
  return false;
}

export function visibleFinanceTabs(level) {
  return ALL_TAB_KEYS.filter((tab) => canAccessFinanceTab(level, tab));
}

export function defaultFinanceTab(level) {
  return "vendas";
}

export function canManageDefaultFine(level) {
  return ["admin", "financeiro", "contador", "agente"].includes(level);
}

/** Sem histórico completo: restrito ao período operacional atual. */
export function isPeriodLockedForUser(user, isAdmin = false) {
  return !canFullHistory(user) && !isAdmin;
}
