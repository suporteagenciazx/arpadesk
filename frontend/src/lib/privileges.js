export const PRIVILEGE_CASH_CLOSING = "cash_closing";
export const PRIVILEGE_SALE_CONFIRM = "sale_confirm";
export const PRIVILEGE_FULL_HISTORY = "full_history";
export const PRIVILEGE_CREATE_PROJECT = "create_project";

export const PRIVILEGE_CATALOG = [
  {
    code: PRIVILEGE_CASH_CLOSING,
    label: "Fechamento de caixa",
    description: "Permite fechar o caixa da semana operacional.",
  },
  {
    code: PRIVILEGE_SALE_CONFIRM,
    label: "Autorização de confirmação de vendas",
    description: "Permite alterar o status das vendas (ex.: confirmar como OK).",
  },
  {
    code: PRIVILEGE_FULL_HISTORY,
    label: "Histórico completo",
    description: "Permite filtrar outros períodos, usar datas personalizadas e navegar entre semanas.",
  },
  {
    code: PRIVILEGE_CREATE_PROJECT,
    label: "Criar projeto",
    description: "Permite cadastrar novos projetos financeiros.",
  },
];

export function hasPrivilege(user, code) {
  if (!user) return false;
  if (user.level === "admin") return true;
  if (user.level === "ilustrativo") return false;
  return (user.privileges || []).includes(code);
}

export function canCashClosing(user) {
  return hasPrivilege(user, PRIVILEGE_CASH_CLOSING);
}

export function canConfirmSale(user) {
  return hasPrivilege(user, PRIVILEGE_SALE_CONFIRM);
}

export function canFullHistory(user) {
  return hasPrivilege(user, PRIVILEGE_FULL_HISTORY);
}

export function canCreateProject(user) {
  return hasPrivilege(user, PRIVILEGE_CREATE_PROJECT);
}
