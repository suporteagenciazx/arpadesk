/** Verifica se o usuário logado pode ver/acessar um setor na sidebar. */
export function userCanAccessSector(user, sector, isAdmin) {
  if (!sector?.route || !sector?.sidebarVisible) return false;
  if (sector.adminOnly && !isAdmin) return false;
  if (isAdmin) return true;
  const ids = user?.sector_ids;
  if (!ids?.length) {
    return sector.id === "financeiro";
  }
  return ids.includes(sector.id);
}

/** Setores que podem ser atribuídos no cadastro de usuário. */
export function assignableSectorsForUser(sectors, level) {
  return sectors.filter(
    (s) => s.route && s.sidebarVisible && (!s.adminOnly || level === "admin")
  );
}

export function defaultSectorIdsForLevel(sectors, level) {
  const navigable = assignableSectorsForUser(sectors, level);
  if (level === "admin") return navigable.map((s) => s.id);
  return navigable.filter((s) => s.id === "financeiro").map((s) => s.id);
}
