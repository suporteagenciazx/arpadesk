import { canFullHistory, hasPrivilege, PRIVILEGE_PAYMENT_CONFIRM, PRIVILEGE_SALE_CONFIRM } from "./privileges";
import { hasProjectSector } from "./memberAccess";

const ALL_TAB_KEYS = ["vendas", "pagamentos", "despesas", "comissoes", "relatorio", "arquivo", "automacoes", "permissoes"];

function normalizeProjectId(projectId) {
  if (projectId == null || projectId === "") return null;
  const pid = Number(projectId);
  return Number.isFinite(pid) ? pid : null;
}

/** Contador: Vendas. Pagamentos: privilégio payment_confirm. Admin: tudo. */
export function canAccessFinanceTab(user, tab, projectId) {
  if (!user?.level) return false;
  if (tab === "permissoes") return user.level === "admin";
  if (user.level === "admin") return true;
  const pid = normalizeProjectId(projectId);
  if (pid != null && !hasProjectSector(user, pid, "financeiro")) return false;
  if (tab === "automacoes") return false;
  if (tab === "pagamentos") {
    return hasPrivilege(user, PRIVILEGE_PAYMENT_CONFIRM, { projectId: pid, sectorId: "financeiro" });
  }
  if (user.level === "financeiro") return tab === "vendas";
  if (user.level === "contador" || user.level === "agente") return tab === "vendas";
  return false;
}

export function visibleFinanceTabs(user, projectId) {
  return ALL_TAB_KEYS.filter((tab) => canAccessFinanceTab(user, tab, projectId));
}

export function defaultFinanceTab(level) {
  return "vendas";
}

export function canManageDefaultFine(level) {
  return ["admin", "financeiro", "contador", "agente"].includes(level);
}

/** Sem histórico completo: restrito ao período operacional atual. */
export function isPeriodLockedForUser(user, isAdmin = false, projectId) {
  return !canFullHistory(user, projectId) && !isAdmin;
}

export function canChangeSaleStatus(user, projectId) {
  if (user?.level === "admin") return true;
  return hasPrivilege(user, PRIVILEGE_SALE_CONFIRM, { projectId, sectorId: "financeiro" });
}

export function canConfirmPayment(user, projectId) {
  if (user?.level === "admin") return true;
  return hasPrivilege(user, PRIVILEGE_PAYMENT_CONFIRM, { projectId, sectorId: "financeiro" });
}
