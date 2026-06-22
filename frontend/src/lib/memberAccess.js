import { getProjectSectorsFromRegistry } from "./projectSectors";
import { FINANCE_PRIVILEGE_CODES, PRIVILEGE_CATALOG } from "./privilegeCatalog";

export { FINANCE_PRIVILEGE_CODES };

export function getProjectAssignment(user, projectId) {
  if (!user?.projects) return null;
  return user.projects.find((p) => p.id === Number(projectId));
}

export function hasProjectSector(user, projectId, sectorId) {
  if (!user) return false;
  if (user.level === "admin") return true;
  const assignment = getProjectAssignment(user, projectId);
  if (!assignment) return false;

  const sectors = assignment.sectors;
  if (!sectors?.length) {
    if (user.sector_ids?.length) return user.sector_ids.includes(sectorId);
    return sectorId === "financeiro";
  }

  const sector = sectors.find((s) => s.sector_id === sectorId);
  return Boolean(sector?.enabled);
}

export function projectSectorPrivileges(user, projectId, sectorId) {
  if (user?.level === "admin") return FINANCE_PRIVILEGE_CODES;
  const assignment = getProjectAssignment(user, projectId);
  if (!assignment?.sectors?.length) {
    return sectorId === "financeiro" ? user?.privileges || [] : [];
  }
  const sector = assignment.sectors.find((s) => s.sector_id === sectorId);
  return sector?.privileges || [];
}

export function defaultProjectAccess(project, sectors, level) {
  const enabledMap = getProjectSectorsFromRegistry(project?.settings, sectors);
  const sectorState = {};
  sectors.forEach((s) => {
    if (!enabledMap[s.id]) return;
    if (s.adminOnly && level !== "admin") return;
    const privs =
      level === "admin" && s.id === "financeiro"
        ? FINANCE_PRIVILEGE_CODES
        : s.id === "financeiro"
          ? level === "financeiro"
            ? ["cash_closing", "sale_confirm"]
            : level === "contador" || level === "agente"
              ? ["cash_closing"]
              : []
          : [];
    sectorState[s.id] = {
      enabled: s.id === "financeiro" || level === "admin",
      privileges: privs,
    };
  });
  return { sectors: sectorState };
}

export function assignmentFromUserProject(projectRow) {
  const sectorState = {};
  (projectRow.sectors || []).forEach((s) => {
    sectorState[s.sector_id] = {
      enabled: Boolean(s.enabled),
      privileges: [...(s.privileges || [])],
    };
  });
  return { sectors: sectorState };
}

export function buildProjectAssignments(form, projects, sectors) {
  return form.project_ids.map((pid) => {
    const access = form.project_access[pid] || { sectors: {} };
    const project = projects.find((p) => p.id === pid);
    const enabledMap = project ? getProjectSectorsFromRegistry(project.settings, sectors) : {};
    return {
      project_id: pid,
      commission_percent: Number(form.project_commissions[pid] ?? 0),
      sectors: sectors
        .filter((s) => enabledMap[s.id] && (!s.adminOnly || form.level === "admin"))
        .map((s) => ({
          sector_id: s.id,
          enabled: Boolean(access.sectors?.[s.id]?.enabled),
          privileges: access.sectors?.[s.id]?.privileges || [],
        })),
    };
  });
}

export function filterProjectsForUser(projects, user, sectorId) {
  if (!user) return [];
  return (projects || []).filter((p) => {
    const enabledMap = getProjectSectorsFromRegistry(p.settings);
    if (!enabledMap[sectorId]) return false;
    if (user.level === "admin") return true;
    const assigned = getProjectAssignment(user, p.id);
    if (!assigned) return false;
    if (!assigned.sectors?.length) {
      if (user.sector_ids?.length) return user.sector_ids.includes(sectorId);
      return sectorId === "financeiro";
    }
    return hasProjectSector(user, p.id, sectorId);
  });
}

export function privilegesForSectorUi(sectorId) {
  if (sectorId === "financeiro") return PRIVILEGE_CATALOG;
  return [];
}
