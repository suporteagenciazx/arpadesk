export { DATE_PRESETS, getPresetRange } from "./calendar";

export function projectDescription(project) {
  if (!project) return "Projeto financeiro";
  if (project.slug === "agencia" || project.name?.toUpperCase() === "AGENCIA") {
    return "Projeto Restrito";
  }
  return project.description || "Projeto financeiro";
}

export function formatMemberLabel(member) {
  const labels = {
    agente: "Contador",
    contador: "Contador",
    financeiro: "Financeiro",
    ilustrativo: "Ilustrativo",
    admin: "Admin",
  };
  const level = labels[member.user_level] || member.user_level;
  if (member.user_level === "admin") {
    return member.user_name;
  }
  return `${member.user_name} (${level}) — ${member.commission_percent}%`;
}

export function formatSaleMemberLabel(member) {
  const labels = {
    agente: "Contador",
    contador: "Contador",
    financeiro: "Financeiro",
    ilustrativo: "Ilustrativo",
    admin: "Admin",
  };
  const level = labels[member.user_level] || member.user_level;
  if (member.user_level === "admin") {
    return member.user_name;
  }
  return `${member.user_name} (${level})`;
}

export function formatProjectAssignment(user, project) {
  if (user.level === "admin") {
    return `${project.name} (lucro)`;
  }
  return `${project.name} (${project.commission_percent}%)`;
}
