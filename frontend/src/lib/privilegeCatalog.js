export const PRIVILEGE_CASH_CLOSING = "cash_closing";
export const PRIVILEGE_SALE_CONFIRM = "sale_confirm";
export const PRIVILEGE_PAYMENT_CONFIRM = "payment_confirm";
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
    code: PRIVILEGE_PAYMENT_CONFIRM,
    label: "Autorização de confirmação de pagamento",
    description: "Permite confirmar pagamentos de comissões na aba Pagamentos.",
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

export const FINANCE_PRIVILEGE_CODES = PRIVILEGE_CATALOG.map((p) => p.code);

export const PRIVILEGE_LABELS = Object.fromEntries(PRIVILEGE_CATALOG.map((p) => [p.code, p.label]));

/** Privilégios editáveis por aba dentro do projeto (popup Permissões). */
export const PROJECT_PRIVILEGE_TABS = [
  {
    id: "vendas",
    label: "Vendas",
    sectorId: "financeiro",
    privileges: [
      {
        code: PRIVILEGE_CASH_CLOSING,
        label: "Fechamento de caixa",
        description: "Permite fechar o caixa da semana operacional.",
        tabHint: "Vendas",
      },
      {
        code: PRIVILEGE_SALE_CONFIRM,
        label: "Autorização de confirmação de vendas",
        description: "Permite alterar o status das vendas (ex.: confirmar como OK).",
        tabHint: "Vendas",
      },
    ],
  },
  {
    id: "pagamentos",
    label: "Pagamentos",
    sectorId: "financeiro",
    privileges: [
      {
        code: PRIVILEGE_PAYMENT_CONFIRM,
        label: "Autorização de confirmação de pagamento",
        description: "Permite confirmar pagamentos de comissões na aba Pagamentos.",
        tabHint: "Pagamentos",
      },
    ],
  },
];

export const EDITABLE_PROJECT_PRIVILEGE_CODES = PROJECT_PRIVILEGE_TABS.flatMap((t) =>
  t.privileges.map((p) => p.code)
);

export function privilegeSummaryLabels(codes = []) {
  const editable = codes.filter((c) => EDITABLE_PROJECT_PRIVILEGE_CODES.includes(c));
  if (!editable.length) return [];
  return editable.map((c) => PRIVILEGE_LABELS[c] || c);
}
