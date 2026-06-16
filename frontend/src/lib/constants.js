export const SALE_VERSIONS = Array.from({ length: 70 }, (_, i) => `V${i + 1}`);

export const KANBAN_COLUMNS = [
  { value: "pendente", label: "Pendente" },
  { value: "em_analise", label: "Em análise" },
  { value: "ok", label: "OK" },
  { value: "bloqueado", label: "Bloqueado" },
  { value: "pendente_selfie", label: "Selfie" },
];

export const SALE_STATUSES = KANBAN_COLUMNS;

export const USER_LEVELS = [
  { value: "admin", label: "Admin" },
  { value: "financeiro", label: "Financeiro" },
  { value: "contador", label: "Contador" },
  { value: "agente", label: "Contador (legado)" },
  { value: "ilustrativo", label: "Ilustrativo" },
];

export const EXPENSE_TYPES = ["DIVULGACAO", "FINANCEIRO", "SUPORTE", "OUTROS"];

export const fmtMoney = (v) =>
  Number(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export const fmtDate = (d) => {
  if (!d) return "—";
  return new Date(d + "T12:00:00").toLocaleDateString("pt-BR");
};
