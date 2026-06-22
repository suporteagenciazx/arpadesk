import {
  getProjectAssignment,
  hasProjectSector,
  projectSectorPrivileges,
} from "./memberAccess";
import {
  PRIVILEGE_CASH_CLOSING,
  PRIVILEGE_SALE_CONFIRM,
  PRIVILEGE_PAYMENT_CONFIRM,
  PRIVILEGE_FULL_HISTORY,
  PRIVILEGE_CREATE_PROJECT,
  PRIVILEGE_CATALOG,
} from "./privilegeCatalog";

export {
  PRIVILEGE_CASH_CLOSING,
  PRIVILEGE_SALE_CONFIRM,
  PRIVILEGE_PAYMENT_CONFIRM,
  PRIVILEGE_FULL_HISTORY,
  PRIVILEGE_CREATE_PROJECT,
  PRIVILEGE_CATALOG,
};

export function hasPrivilege(user, code, options = {}) {
  const { projectId, sectorId = "financeiro" } = options;
  if (!user) return false;
  if (user.level === "admin") return true;
  if (user.level === "ilustrativo") return false;
  if (projectId != null) {
    if (!hasProjectSector(user, projectId, sectorId)) return false;
    return projectSectorPrivileges(user, projectId, sectorId).includes(code);
  }
  return (user.privileges || []).includes(code);
}

export function canCashClosing(user, projectId) {
  return hasPrivilege(user, PRIVILEGE_CASH_CLOSING, { projectId, sectorId: "financeiro" });
}

export function canConfirmSale(user, projectId) {
  return hasPrivilege(user, PRIVILEGE_SALE_CONFIRM, { projectId, sectorId: "financeiro" });
}

export function canFullHistory(user, projectId) {
  return hasPrivilege(user, PRIVILEGE_FULL_HISTORY, { projectId, sectorId: "financeiro" });
}

export function canCreateProject(user) {
  return hasPrivilege(user, PRIVILEGE_CREATE_PROJECT);
}

export function canConfirmPayment(user, projectId) {
  return hasPrivilege(user, PRIVILEGE_PAYMENT_CONFIRM, { projectId, sectorId: "financeiro" });
}

export function getAssignment(user, projectId) {
  return getProjectAssignment(user, projectId);
}
