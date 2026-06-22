/** Setores — registry global + helpers por projeto */

export const DEFAULT_SECTOR_COLORS = {
  financeiro: "#2563eb",
  marketing: "#db2777",
  operacional: "#059669",
  logistica: "#d97706",
};

/** @deprecated use useSectors() — fallback estático */
export const SECTORS = [
  { id: "financeiro", label: "Financeiro", alwaysOn: true, color: DEFAULT_SECTOR_COLORS.financeiro },
  { id: "marketing", label: "Marketing", color: DEFAULT_SECTOR_COLORS.marketing },
  { id: "operacional", label: "Operacional", color: DEFAULT_SECTOR_COLORS.operacional },
  { id: "logistica", label: "Logística", color: DEFAULT_SECTOR_COLORS.logistica },
];

export const OPTIONAL_SECTORS = SECTORS.filter((s) => !s.alwaysOn);

export function buildSectorsFromRegistry(raw = []) {
  return (raw || [])
    .map((s) => ({
      id: s.id,
      label: s.label,
      color: s.color || DEFAULT_SECTOR_COLORS[s.id] || "#64748b",
      alwaysOn: Boolean(s.always_on),
      adminOnly: Boolean(s.admin_only),
      sidebarVisible: Boolean(s.sidebar_visible),
      sidebarOrder: Number(s.sidebar_order ?? 0),
      route: s.route || null,
    }))
    .sort((a, b) => a.sidebarOrder - b.sidebarOrder || a.label.localeCompare(b.label));
}

export function optionalSectorsFromRegistry(registry) {
  return (registry || []).filter((s) => !s.alwaysOn && !s.adminOnly);
}

export function getProjectSectorsFromRegistry(settings, registry) {
  const raw = settings?.sectors || {};
  const legacyMarketing = Boolean(settings?.marketing_config?.enabled);
  const merged = {};
  for (const s of registry || SECTORS) {
    const alwaysOn = s.alwaysOn ?? s.always_on;
    if (alwaysOn) {
      merged[s.id] = true;
    } else if (Object.prototype.hasOwnProperty.call(raw, s.id)) {
      merged[s.id] = Boolean(raw[s.id]);
    } else if (s.id === "marketing" && legacyMarketing) {
      merged[s.id] = true;
    } else {
      merged[s.id] = false;
    }
  }
  return merged;
}

export function getProjectSectors(settings) {
  return getProjectSectorsFromRegistry(settings, SECTORS);
}

export function isSectorEnabled(project, sectorId, registry = SECTORS) {
  if (Array.isArray(project?.sectors)) {
    return Boolean(project.sectors.find((s) => s.id === sectorId)?.enabled);
  }
  return Boolean(getProjectSectorsFromRegistry(project?.settings, registry)[sectorId]);
}

export function getEnabledSectorsWithColorsFromRegistry(project, registry) {
  if (Array.isArray(project?.sectors)) {
    return project.sectors
      .filter((s) => s.enabled)
      .map((s) => ({
        id: s.id,
        label: s.label,
        color: s.color || DEFAULT_SECTOR_COLORS[s.id] || "#64748b",
      }));
  }
  const state = getProjectSectorsFromRegistry(project?.settings, registry);
  return (registry || SECTORS)
    .filter((s) => state[s.id])
    .map((s) => ({
      id: s.id,
      label: s.label,
      color: s.color || DEFAULT_SECTOR_COLORS[s.id] || "#64748b",
    }));
}

export function getEnabledSectorsWithColors(project) {
  return getEnabledSectorsWithColorsFromRegistry(project, SECTORS);
}

export function filterProjectsBySector(projects, sectorId) {
  return (projects || []).filter((p) => isSectorEnabled(p, sectorId));
}

export function sectorColorFromRegistry(registry, sectorId) {
  const s = (registry || SECTORS).find((x) => x.id === sectorId);
  return s?.color || DEFAULT_SECTOR_COLORS[sectorId] || "#64748b";
}

export function enabledSectorLabels(project) {
  return getEnabledSectorsWithColors(project).map((s) => s.label);
}
