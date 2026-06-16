const ALL_TAB_KEYS = ["vendas", "pagamentos", "despesas", "comissoes", "relatorio"];

/** Contador: apenas Vendas. Financeiro: Vendas + Pagamentos. Admin: tudo. */
export function canAccessFinanceTab(level, tab) {
  if (!level) return false;
  if (level === "admin") return true;
  if (level === "financeiro") return tab === "vendas" || tab === "pagamentos";
  if (level === "contador" || level === "agente") return tab === "vendas";
  return false;
}

export function visibleFinanceTabs(level) {
  return ALL_TAB_KEYS.filter((tab) => canAccessFinanceTab(level, tab));
}

export function defaultFinanceTab(level) {
  return "vendas";
}
