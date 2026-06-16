from __future__ import annotations

from datetime import date, datetime
from typing import Any

from sqlalchemy.orm import Session, joinedload

from app.models import Expense, Payment, Project, Sale, User
from app.services.finance import compute_summary

TELEGRAM_VARIABLE_GROUPS = [
    {
        "group": "Geral",
        "variables": [
            {"key": "nome", "description": "Nome do colaborador"},
            {"key": "projeto", "description": "Nome do projeto"},
            {"key": "data", "description": "Data atual (AAAA-MM-DD)"},
            {"key": "periodo_inicio", "description": "Início do período filtrado"},
            {"key": "periodo_fim", "description": "Fim do período filtrado"},
        ],
    },
    {
        "group": "Vendas",
        "variables": [
            {"key": "sale_id", "description": "ID interno da venda"},
            {"key": "sale_code", "description": "Código da venda (6 dígitos)"},
            {"key": "cnpj", "description": "CNPJ da venda"},
            {"key": "telefone", "description": "Telefone da venda"},
            {"key": "sale_version", "description": "Versão da venda (V1, V2…)"},
            {"key": "doc_type", "description": "Tipo de documento"},
            {"key": "doc_custom", "description": "Documento personalizado"},
            {"key": "valor", "description": "Valor da venda"},
            {"key": "status", "description": "Status da venda"},
            {"key": "sale_date", "description": "Data da venda"},
            {"key": "agente", "description": "Nome do agente/gerente da venda"},
        ],
    },
    {
        "group": "Despesas",
        "variables": [
            {"key": "expense_type", "description": "Tipo da despesa"},
            {"key": "expense_amount", "description": "Valor da despesa"},
            {"key": "expense_date", "description": "Data da despesa"},
            {"key": "expense_notes", "description": "Observações da despesa"},
        ],
    },
    {
        "group": "Comissões e resumo",
        "variables": [
            {"key": "commission_percent", "description": "% de comissão do colaborador"},
            {"key": "commission_amount", "description": "Valor da comissão"},
            {"key": "total_sales", "description": "Total de vendas OK no período"},
            {"key": "total_commissions", "description": "Total de comissões no período"},
            {"key": "total_expenses", "description": "Total de despesas no período"},
            {"key": "balance", "description": "Saldo / lucro do admin no período"},
            {"key": "colaborador", "description": "Nome do colaborador (comissão)"},
        ],
    },
    {
        "group": "Pagamentos",
        "variables": [
            {"key": "payment_base", "description": "Valor base do pagamento"},
            {"key": "payment_fine_percent", "description": "% de multa"},
            {"key": "payment_fine_amount", "description": "Valor da multa"},
            {"key": "payment_final", "description": "Valor final do pagamento"},
            {"key": "payment_status", "description": "Status do pagamento"},
            {"key": "payment_notes", "description": "Observações do pagamento"},
        ],
    },
]


DEFAULT_REGISTRATION_TEMPLATE = (
    "📝 Nova venda registrada\n"
    "Projeto: {{projeto}}\n"
    "Código: {{sale_code}}\n"
    "Agente: {{agente}}\n"
    "Valor: R$ {{valor}}\n"
    "Status: {{status}}"
)

DEFAULT_CONFIRMATION_TEMPLATE = (
    "✅ Venda confirmada {{sale_code}} no projeto {{projeto}}\n"
    "Agente: {{agente}}\n"
    "Valor: R$ {{valor}}\n"
    "Status: {{status}}\n"
    "Saldo (lucro): R$ {{balance}}"
)


def _fmt(value: Any) -> str:
    if value is None:
        return ""
    if isinstance(value, datetime):
        return value.date().isoformat()
    if isinstance(value, date):
        return value.isoformat()
    if isinstance(value, float):
        return f"{value:.2f}"
    return str(value)


def render_template(template: str, variables: dict[str, Any]) -> str:
    if not template:
        return ""
    text = template
    for key, value in variables.items():
        text = text.replace(f"{{{{{key}}}}}", _fmt(value))
    return text


def build_sale_context(
    db: Session,
    sale: Sale,
    project: Project,
    period_start: date | None = None,
    period_end: date | None = None,
) -> dict[str, Any]:
    summary = compute_summary(db, project.id, period_start, period_end)
    participant = sale.participant
    commission_row = next(
        (c for c in summary["commissions"] if c["user_id"] == sale.participant_id),
        None,
    )
    today = date.today()
    return {
        "nome": participant.name if participant else "",
        "colaborador": participant.name if participant else "",
        "agente": participant.name if participant else "",
        "projeto": project.name,
        "data": today.isoformat(),
        "periodo_inicio": period_start.isoformat() if period_start else "",
        "periodo_fim": period_end.isoformat() if period_end else "",
        "sale_id": sale.id,
        "sale_code": sale.sale_code,
        "cnpj": sale.cnpj or "",
        "telefone": sale.phone or "",
        "sale_version": sale.sale_version,
        "doc_type": sale.doc_type,
        "doc_custom": sale.doc_custom or "",
        "valor": float(sale.amount),
        "status": sale.status.value if hasattr(sale.status, "value") else sale.status,
        "sale_date": sale.sale_date.isoformat() if sale.sale_date else "",
        "expense_type": "",
        "expense_amount": "",
        "expense_date": "",
        "expense_notes": "",
        "commission_percent": commission_row["commission_percent"] if commission_row else "",
        "commission_amount": commission_row["commission_amount"] if commission_row else "",
        "total_sales": summary["total_sales"],
        "total_commissions": summary["total_commissions"],
        "total_expenses": summary["total_expenses"],
        "balance": summary["balance"],
        "payment_base": "",
        "payment_fine_percent": "",
        "payment_fine_amount": "",
        "payment_final": "",
        "payment_status": "",
        "payment_notes": "",
    }


def build_expense_context(db: Session, expense: Expense, project: Project) -> dict[str, Any]:
    summary = compute_summary(db, project.id)
    today = date.today()
    return {
        "nome": "",
        "colaborador": "",
        "agente": "",
        "projeto": project.name,
        "data": today.isoformat(),
        "periodo_inicio": "",
        "periodo_fim": "",
        "sale_id": "",
        "sale_code": "",
        "cnpj": "",
        "telefone": "",
        "sale_version": "",
        "doc_type": "",
        "doc_custom": "",
        "valor": "",
        "status": "",
        "sale_date": "",
        "expense_type": expense.expense_type,
        "expense_amount": float(expense.amount),
        "expense_date": expense.expense_date.isoformat() if expense.expense_date else "",
        "expense_notes": expense.notes or "",
        "commission_percent": "",
        "commission_amount": "",
        "total_sales": summary["total_sales"],
        "total_commissions": summary["total_commissions"],
        "total_expenses": summary["total_expenses"],
        "balance": summary["balance"],
        "payment_base": "",
        "payment_fine_percent": "",
        "payment_fine_amount": "",
        "payment_final": "",
        "payment_status": "",
        "payment_notes": "",
    }


def build_payment_context(db: Session, payment: Payment, project: Project) -> dict[str, Any]:
    summary = compute_summary(db, project.id, payment.period_start, payment.period_end)
    participant = (
        db.query(User).filter(User.id == payment.participant_id).first()
        if payment.participant_id
        else None
    )
    today = date.today()
    return {
        "nome": participant.name if participant else "",
        "colaborador": participant.name if participant else "",
        "agente": participant.name if participant else "",
        "projeto": project.name,
        "data": today.isoformat(),
        "periodo_inicio": payment.period_start.isoformat() if payment.period_start else "",
        "periodo_fim": payment.period_end.isoformat() if payment.period_end else "",
        "sale_id": "",
        "sale_code": "",
        "cnpj": "",
        "telefone": "",
        "sale_version": "",
        "doc_type": "",
        "doc_custom": "",
        "valor": "",
        "status": "",
        "sale_date": "",
        "expense_type": "",
        "expense_amount": "",
        "expense_date": "",
        "expense_notes": "",
        "commission_percent": "",
        "commission_amount": float(payment.base_amount),
        "total_sales": summary["total_sales"],
        "total_commissions": summary["total_commissions"],
        "total_expenses": summary["total_expenses"],
        "balance": summary["balance"],
        "payment_base": float(payment.base_amount),
        "payment_fine_percent": float(payment.fine_percent or 0),
        "payment_fine_amount": float(payment.fine_amount or 0),
        "payment_final": float(payment.final_amount),
        "payment_status": payment.status.value if hasattr(payment.status, "value") else payment.status,
        "payment_notes": payment.notes or "",
    }


def sample_context() -> dict[str, Any]:
    today = date.today().isoformat()
    return {
        "nome": "Agente Demo",
        "colaborador": "Agente Demo",
        "agente": "Agente Demo",
        "projeto": "AGENCIA",
        "data": today,
        "periodo_inicio": today,
        "periodo_fim": today,
        "sale_id": 1,
        "sale_code": "123456",
        "cnpj": "00.000.000/0001-00",
        "telefone": "5511999999999",
        "sale_version": "V1",
        "doc_type": "LAE",
        "doc_custom": "",
        "valor": 1500.0,
        "status": "ok",
        "sale_date": today,
        "expense_type": "DIVULGACAO",
        "expense_amount": -200.0,
        "expense_date": today,
        "expense_notes": "Exemplo de despesa",
        "commission_percent": 10.0,
        "commission_amount": 150.0,
        "total_sales": 1500.0,
        "total_commissions": 150.0,
        "total_expenses": -200.0,
        "balance": 1150.0,
        "payment_base": 150.0,
        "payment_fine_percent": 0,
        "payment_fine_amount": 0,
        "payment_final": 150.0,
        "payment_status": "pendente",
        "payment_notes": "Pagamento de exemplo",
    }


def notify_sale_on_ok(db: Session, sale_id: int, project_id: int) -> None:
    from app.models import SaleStatus, TelegramSettings
    from app.services.telegram import TelegramError, send_telegram_message

    sale = (
        db.query(Sale)
        .options(joinedload(Sale.participant))
        .filter(Sale.id == sale_id, Sale.project_id == project_id)
        .first()
    )
    project = db.get(Project, project_id)
    if not sale or not project or sale.status != SaleStatus.ok:
        return

    settings_dict = project.settings or {}
    if not settings_dict.get("telegram_notify_on_ok"):
        return

    telegram = db.get(TelegramSettings, 1)
    if not telegram or not telegram.bot_token:
        return
    chat_id = telegram.confirmation_chat_id or telegram.chat_id
    if not chat_id:
        return

    template = (
        telegram.confirmation_template
        or telegram.message_template
        or DEFAULT_CONFIRMATION_TEMPLATE
    )
    context = build_sale_context(db, sale, project)
    text = render_template(template, context).strip()
    if not text:
        return

    try:
        send_telegram_message(telegram.bot_token, chat_id, text)
    except TelegramError:
        pass


def notify_sale_registration(db: Session, sale_id: int, project_id: int) -> None:
    from app.models import TelegramSettings
    from app.services.telegram import TelegramError, send_telegram_message

    telegram = db.get(TelegramSettings, 1)
    if not telegram or not telegram.notify_on_registration:
        return
    if not telegram.bot_token:
        return
    chat_id = telegram.registration_chat_id or telegram.chat_id
    if not chat_id:
        return

    sale = (
        db.query(Sale)
        .options(joinedload(Sale.participant))
        .filter(Sale.id == sale_id, Sale.project_id == project_id)
        .first()
    )
    project = db.get(Project, project_id)
    if not sale or not project:
        return

    template = telegram.registration_template or DEFAULT_REGISTRATION_TEMPLATE
    context = build_sale_context(db, sale, project)
    text = render_template(template, context).strip()
    if not text:
        return

    try:
        send_telegram_message(telegram.bot_token, chat_id, text)
    except TelegramError:
        pass


def notify_sale_event(db: Session, sale_id: int, project_id: int) -> None:
    """Compat: redireciona para envio apenas quando status OK e switch ativo."""
    notify_sale_on_ok(db, sale_id, project_id)
