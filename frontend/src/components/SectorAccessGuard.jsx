import { Navigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useSectors } from "../context/SectorsContext";
import { userCanAccessSector } from "../lib/userSectors";

/** Rota de projetos do primeiro setor acessível ao usuário. */
export function defaultProjectsRoute(user, isAdmin, sectors) {
  const navigable = (sectors || []).filter((s) => s.route && s.sidebarVisible);
  const allowed = navigable.filter((s) => userCanAccessSector(user, s, isAdmin));
  if (allowed.length > 0) return allowed[0].route;
  return "/financeiro";
}

/**
 * Bloqueia rotas de setor quando o usuário não tem acesso.
 * Admin-only ou setor não atribuído → redireciona ao primeiro setor permitido.
 */
export default function SectorAccessGuard({ sectorId, children }) {
  const { user, isAdmin, loading: authLoading } = useAuth();
  const { sectors, loading: sectorsLoading } = useSectors();

  if (authLoading || sectorsLoading) {
    return <p className="muted center-page">Carregando...</p>;
  }

  const sector =
    sectors.find((s) => s.id === sectorId) ||
    ({
      id: sectorId,
      adminOnly: sectorId === "suporte",
    });

  if (!userCanAccessSector(user, sector, isAdmin)) {
    return <Navigate to={defaultProjectsRoute(user, isAdmin, sectors)} replace />;
  }

  return children;
}
