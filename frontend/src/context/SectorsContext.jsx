import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import api from "../lib/api";
import { useAuth } from "./AuthContext";
import {
  DEFAULT_SECTOR_COLORS,
  buildSectorsFromRegistry,
  getEnabledSectorsWithColorsFromRegistry,
  getProjectSectorsFromRegistry,
  optionalSectorsFromRegistry,
} from "../lib/projectSectors";

const FALLBACK_SECTORS = buildSectorsFromRegistry([
  { id: "financeiro", label: "Financeiro", color: DEFAULT_SECTOR_COLORS.financeiro, always_on: true, sidebar_visible: true, sidebar_order: 0, route: "/financeiro" },
  { id: "marketing", label: "Marketing", color: DEFAULT_SECTOR_COLORS.marketing, always_on: false, sidebar_visible: true, sidebar_order: 1, route: "/marketing" },
  { id: "operacional", label: "Operacional", color: DEFAULT_SECTOR_COLORS.operacional, always_on: false, sidebar_visible: false, sidebar_order: 2, route: null },
  { id: "logistica", label: "Logística", color: DEFAULT_SECTOR_COLORS.logistica, always_on: false, sidebar_visible: false, sidebar_order: 3, route: null },
  { id: "suporte", label: "Suporte", color: "#7c3aed", always_on: false, admin_only: true, sidebar_visible: true, sidebar_order: 4, route: "/suporte" },
]);

const SectorsContext = createContext(null);

export function SectorsProvider({ children }) {
  const { user } = useAuth();
  const [registry, setRegistry] = useState(FALLBACK_SECTORS);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    if (!user) {
      setRegistry(FALLBACK_SECTORS);
      setLoading(false);
      return Promise.resolve();
    }
    setLoading(true);
    return api
      .get("/api/sectors")
      .then(({ data }) => {
        const list = buildSectorsFromRegistry(data.sectors || []);
        setRegistry(list.length ? list : FALLBACK_SECTORS);
      })
      .catch(() => setRegistry(FALLBACK_SECTORS))
      .finally(() => setLoading(false));
  }, [user]);

  useEffect(() => {
    load();
  }, [load]);

  const sectors = useMemo(() => registry, [registry]);
  const optionalSectors = useMemo(() => optionalSectorsFromRegistry(registry), [registry]);
  const sidebarSectors = useMemo(
    () => registry.filter((s) => s.sidebarVisible && s.route),
    [registry]
  );

  const value = useMemo(
    () => ({
      sectors,
      optionalSectors,
      sidebarSectors,
      loading,
      reloadSectors: load,
      getProjectSectors: (settings) => getProjectSectorsFromRegistry(settings, registry),
      getEnabledSectorsWithColors: (project) =>
        getEnabledSectorsWithColorsFromRegistry(project, registry),
      sectorById: (id) => registry.find((s) => s.id === id),
    }),
    [sectors, optionalSectors, sidebarSectors, loading, load, registry]
  );

  return <SectorsContext.Provider value={value}>{children}</SectorsContext.Provider>;
}

export function useSectors() {
  const ctx = useContext(SectorsContext);
  if (!ctx) {
    throw new Error("useSectors must be used within SectorsProvider");
  }
  return ctx;
}

/** Hook seguro fora do provider (fallback estático). */
export function useSectorsOptional() {
  return useContext(SectorsContext);
}
