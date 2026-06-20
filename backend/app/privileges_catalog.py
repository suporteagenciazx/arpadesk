"""Catálogo de privilégios (funcionalidades por usuário, exceto ilustrativo)."""

from app.models import UserLevel

PRIVILEGE_CASH_CLOSING = "cash_closing"
PRIVILEGE_SALE_CONFIRM = "sale_confirm"
PRIVILEGE_FULL_HISTORY = "full_history"
PRIVILEGE_CREATE_PROJECT = "create_project"

PRIVILEGE_CATALOG: list[dict[str, str]] = [
    {
        "code": PRIVILEGE_CASH_CLOSING,
        "label": "Fechamento de caixa",
        "description": "Permite fechar o caixa da semana operacional.",
    },
    {
        "code": PRIVILEGE_SALE_CONFIRM,
        "label": "Autorização de confirmação de vendas",
        "description": "Permite alterar o status das vendas (ex.: confirmar como OK).",
    },
    {
        "code": PRIVILEGE_FULL_HISTORY,
        "label": "Histórico completo",
        "description": "Permite filtrar outros períodos, usar datas personalizadas e navegar entre semanas.",
    },
    {
        "code": PRIVILEGE_CREATE_PROJECT,
        "label": "Criar projeto",
        "description": "Permite cadastrar novos projetos financeiros.",
    },
]

PRIVILEGE_CODES = {p["code"] for p in PRIVILEGE_CATALOG}


def privileges_for_level(level: UserLevel) -> list[str]:
    """Privilégios padrão ao criar usuário (admin ignora — tem tudo)."""
    if level == UserLevel.financeiro:
        return [PRIVILEGE_CASH_CLOSING, PRIVILEGE_SALE_CONFIRM]
    if level in (UserLevel.contador, UserLevel.agente):
        return [PRIVILEGE_CASH_CLOSING]
    return []
