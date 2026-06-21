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
            {"key": "payment_date", "description": "Data/hora do pagamento"},
        ],
    },
    {
        "group": "Fechamento de caixa",
        "variables": [
            {"key": "closed_by", "description": "Quem fechou o caixa"},
            {"key": "closed_at", "description": "Data e hora do fechamento"},
            {"key": "billing_total", "description": "Faturamento do período"},
            {"key": "ok_sales_count", "description": "Quantidade de vendas OK"},
            {"key": "fines_total", "description": "Total de multas"},
        ],
    },
    {
        "group": "Multas",
        "variables": [
            {"key": "fine_amount", "description": "Valor da multa"},
            {"key": "fine_notes", "description": "Observações da multa"},
        ],
    },
    {
        "group": "Despesas (ação)",
        "variables": [
            {"key": "expense_action", "description": "Ação: adicionada, editada ou excluída"},
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

DEFAULT_CASH_CLOSING_TEMPLATE = (
    "🔒 Fechamento de caixa\n"
    "Fechado por: {{closed_by}}\n"
    "Em: {{closed_at}}\n"
    "Projeto: {{projeto}}\n"
    "Período: {{periodo_inicio}} a {{periodo_fim}}\n\n"
    "Faturamento: R$ {{billing_total}}\n"
    "Vendas OK: {{ok_sales_count}}\n"
    "Multas: R$ {{fines_total}}\n"
    "Lucro: R$ {{balance}}"
)

DEFAULT_GOAL_REACHED_TEMPLATE = (
    "🎯 Meta atingida\n"
    "Projeto: {{projeto}}\n"
    "Período: {{periodo_inicio}} a {{periodo_fim}}\n\n"
    "Regra de meta será configurada em breve."
)

DEFAULT_PAYMENT_PAID_TEMPLATE = (
    "💸 Pagamento realizado\n"
    "Projeto: {{projeto}}\n"
    "Semana: {{periodo_inicio}} a {{periodo_fim}}\n"
    "Data do pagamento: {{payment_date}}\n"
    "Recebedor: {{colaborador}}\n"
    "Valor pago: R$ {{payment_final}}"
)

DEFAULT_FINE_ADDED_TEMPLATE = (
    "⚠️ Multa registrada\n"
    "Projeto: {{projeto}}\n"
    "Semana: {{periodo_inicio}} a {{periodo_fim}}\n"
    "Colaborador: {{colaborador}}\n"
    "Valor: R$ {{fine_amount}}\n"
    "Obs: {{fine_notes}}"
)

DEFAULT_EXPENSE_CHANGED_TEMPLATE = (
    "📋 Despesa {{expense_action}}\n"
    "Projeto: {{projeto}}\n"
    "Tipo: {{expense_type}}\n"
    "Valor: R$ {{expense_amount}}\n"
    "Data: {{expense_date}}\n"
    "Obs: {{expense_notes}}"
)


def _fmt(value: Any) -> str:
    if value is None:
        return ""
    if isinstance(value, datetime):
        return value.strftime("%d/%m/%Y %H:%M")
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


def build_expense_context(
    db: Session, expense: Expense, project: Project, *, action: str = "adicionada"
) -> dict[str, Any]:
    summary = compute_summary(db, project.id)
    today = date.today()
    return {
        "nome": "",
        "colaborador": "",
        "agente": "",
        "projeto": project.name,
        "data": today.isoformat(),
        "periodo_inicio": expense.expense_date.isoformat() if expense.expense_date else "",
        "periodo_fim": expense.expense_date.isoformat() if expense.expense_date else "",
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
        "expense_action": action,
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
        "payment_date": "",
        "closed_by": "",
        "closed_at": "",
        "billing_total": "",
        "ok_sales_count": "",
        "fines_total": "",
        "fine_amount": "",
        "fine_notes": "",
    }


def build_expense_snapshot_context(project: Project, snapshot: dict, *, action: str) -> dict[str, Any]:
    return {
        "projeto": project.name,
        "expense_type": snapshot.get("expense_type", ""),
        "expense_amount": snapshot.get("amount", ""),
        "expense_date": snapshot.get("expense_date", ""),
        "expense_notes": snapshot.get("notes", ""),
        "expense_action": action,
        "data": date.today().isoformat(),
        "periodo_inicio": snapshot.get("expense_date", ""),
        "periodo_fim": snapshot.get("expense_date", ""),
    }


def build_fine_context(db: Session, fine, project: Project) -> dict[str, Any]:
    from app.models import PeriodFine

    assert isinstance(fine, PeriodFine)
    participant = fine.participant
    summary = compute_summary(db, project.id, fine.period_start, fine.period_end)
    return {
        "nome": participant.name if participant else "",
        "colaborador": participant.name if participant else "",
        "agente": participant.name if participant else "",
        "projeto": project.name,
        "data": date.today().isoformat(),
        "periodo_inicio": fine.period_start.isoformat() if fine.period_start else "",
        "periodo_fim": fine.period_end.isoformat() if fine.period_end else "",
        "fine_amount": float(fine.amount),
        "fine_notes": fine.notes or "",
        "total_sales": summary["total_sales"],
        "total_commissions": summary["total_commissions"],
        "total_expenses": summary["total_expenses"],
        "balance": summary["balance"],
        "expense_action": "",
        "payment_date": "",
        "closed_by": "",
        "closed_at": "",
        "billing_total": summary["total_sales"],
        "ok_sales_count": "",
        "fines_total": float(fine.amount),
    }


def build_cash_closing_context(db: Session, closing, project: Project) -> dict[str, Any]:
    from app.models import CashClosing

    assert isinstance(closing, CashClosing)
    snap = closing.summary_snapshot or {}
    summary = compute_summary(db, project.id, closing.period_start, closing.period_end)
    closed_by = closing.closed_by.name if closing.closed_by else ""
    closed_at = closing.closed_at.strftime("%d/%m/%Y %H:%M") if closing.closed_at else ""
    return {
        "projeto": project.name,
        "data": date.today().isoformat(),
        "periodo_inicio": closing.period_start.isoformat() if closing.period_start else "",
        "periodo_fim": closing.period_end.isoformat() if closing.period_end else "",
        "closed_by": closed_by,
        "closed_at": closed_at,
        "billing_total": snap.get("billing_total", summary.get("total_sales", 0)),
        "ok_sales_count": snap.get("ok_sales_count", 0),
        "fines_total": snap.get("fines_total", 0),
        "balance": summary.get("balance", 0),
        "total_sales": summary.get("total_sales", 0),
        "total_commissions": summary.get("total_commissions", 0),
        "total_expenses": summary.get("total_expenses", 0),
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
        "payment_date": payment.paid_at.strftime("%d/%m/%Y %H:%M") if payment.paid_at else "",
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
        "payment_date": "14/11/2025 10:30",
        "closed_by": "Financeiro Demo",
        "closed_at": "14/11/2025 18:00",
        "billing_total": 1500.0,
        "ok_sales_count": 3,
        "fines_total": 50.0,
        "fine_amount": 50.0,
        "fine_notes": "Atraso no envio",
        "expense_action": "adicionada",
    }


def _send_sale_telegram(
    bot_token: str,
    chat_id: str,
    template: str,
    context: dict,
    attach_cp: bool,
    sale,
) -> None:
    from app.services.storage import StorageError, download_object, object_filename
    from app.services.telegram import TelegramError, send_telegram_notification

    text = render_template(template, context).strip()
    if not text:
        return

    file_bytes = None
    filename = None
    if attach_cp and sale.cp_attachment_url:
        try:
            file_bytes, _ = download_object(sale.cp_attachment_url)
            filename = object_filename(sale.cp_attachment_url)
        except StorageError:
            file_bytes = None

    try:
        send_telegram_notification(
            bot_token,
            chat_id,
            text,
            file_bytes=file_bytes,
            filename=filename,
        )
    except TelegramError:
        pass


def notify_sale_on_ok(db: Session, sale_id: int, project_id: int) -> None:
    from app.models import ProjectAutomationType, SaleStatus

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

    from app.services.project_automation import get_automation_by_key

    automation = get_automation_by_key(db, project_id, ProjectAutomationType.sale_confirmation)
    if not automation or not automation.is_enabled:
        return

    config = automation.config or {}
    chat_id = config.get("chat_id")
    if not chat_id:
        return

    from app.services.telegram_bot import get_active_bot_token

    bot_token = get_active_bot_token(db, config.get("bot_id"))
    if not bot_token:
        return

    template = config.get("template") or DEFAULT_CONFIRMATION_TEMPLATE
    context = build_sale_context(db, sale, project)
    _send_sale_telegram(
        bot_token,
        chat_id,
        template,
        context,
        bool(config.get("attach_cp")),
        sale,
    )


def notify_sale_registration(db: Session, sale_id: int, project_id: int) -> None:
    from app.services.project_automation import get_automation_by_key
    from app.models import ProjectAutomationType

    automation = get_automation_by_key(db, project_id, ProjectAutomationType.sale_registration)
    if not automation or not automation.is_enabled:
        return

    config = automation.config or {}
    chat_id = config.get("chat_id")
    if not chat_id:
        return

    from app.services.telegram_bot import get_active_bot_token

    bot_token = get_active_bot_token(db, config.get("bot_id"))
    if not bot_token:
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

    template = config.get("template") or DEFAULT_REGISTRATION_TEMPLATE
    context = build_sale_context(db, sale, project)
    _send_sale_telegram(
        bot_token,
        chat_id,
        template,
        context,
        bool(config.get("attach_cp")),
        sale,
    )


def notify_sale_event(db: Session, sale_id: int, project_id: int) -> None:
    """Compat: redireciona para envio apenas quando status OK e switch ativo."""
    notify_sale_on_ok(db, sale_id, project_id)
