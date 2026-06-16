export function getPresetRange(preset) {
  const today = new Date();
  const end = toIso(today);

  switch (preset) {
    case "atual":
      return getCurrentPeriodRange(today);
    case "today":
      return { start: end, end };
    case "7d":
      return { start: toIso(addDays(today, -6)), end };
    case "15d":
      return { start: toIso(addDays(today, -14)), end };
    case "month": {
      const start = new Date(today.getFullYear(), today.getMonth(), 1);
      return { start: toIso(start), end };
    }
    case "6m": {
      const start = new Date(today.getFullYear(), today.getMonth() - 6, today.getDate());
      return { start: toIso(start), end };
    }
    default:
      return { start: "", end: "" };
  }
}

/** Semana operacional: segunda a sexta. Sábado e domingo apontam para a próxima semana útil. */
export function getCurrentPeriodRange(today = new Date()) {
  const day = today.getDay();
  let monday;
  let friday;

  if (day === 0) {
    monday = addDays(today, 1);
    friday = addDays(today, 5);
  } else if (day === 6) {
    monday = addDays(today, 2);
    friday = addDays(today, 6);
  } else {
    monday = addDays(today, -(day - 1));
    friday = addDays(monday, 4);
  }

  return { start: toIso(monday), end: toIso(friday) };
}

function addDays(date, days) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function toIso(date) {
  return date.toISOString().slice(0, 10);
}

export const DATE_PRESETS = [
  { id: "atual", label: "Atual" },
  { id: "today", label: "Hoje" },
  { id: "7d", label: "Últimos 7 dias" },
  { id: "15d", label: "Últimos 15 dias" },
  { id: "month", label: "Mês" },
  { id: "6m", label: "Últimos 6 meses" },
  { id: "custom", label: "Personalizado" },
];

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

export function formatProjectAssignment(user, project) {
  if (user.level === "admin") {
    return `${project.name} (lucro)`;
  }
  return `${project.name} (${project.commission_percent}%)`;
}
