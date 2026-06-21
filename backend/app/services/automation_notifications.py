"""Disparo de notificações Telegram por tipo de automação do projeto."""

from __future__ import annotations

from sqlalchemy.orm import Session, joinedload

from app.models import CashClosing, Expense, Payment, PeriodFine, Project, ProjectAutomationType, User, UserLevel
from app.services.project_automation import get_automation_by_key
from app.services.telegram_bot import get_active_bot_token
from app.services.telegram_templates import (
    DEFAULT_CASH_CLOSING_TEMPLATE,
    DEFAULT_EXPENSE_CHANGED_TEMPLATE,
    DEFAULT_FINE_ADDED_TEMPLATE,
    DEFAULT_PAYMENT_PAID_TEMPLATE,
    _send_sale_telegram,
    build_cash_closing_context,
    build_expense_context,
    build_expense_snapshot_context,
    build_fine_context,
    build_payment_context,
)


def _dispatch(
    db: Session,
    project_id: int,
    key: ProjectAutomationType,
    context: dict,
    *,
    template_fallback: str,
) -> None:
    automation = get_automation_by_key(db, project_id, key)
    if not automation or not automation.is_enabled:
        return

    config = automation.config or {}
    chat_id = (config.get("chat_id") or "").strip()
    if not chat_id:
        return

    bot_token = get_active_bot_token(db, config.get("bot_id"))
    if not bot_token:
        return

    template = (config.get("template") or template_fallback).strip()
    _send_sale_telegram(
        bot_token,
        chat_id,
        template,
        context,
        bool(config.get("attach_cp")),
        None,
    )


def notify_cash_closing_by_non_admin(db: Session, project_id: int, closing_id: int, actor: User) -> None:
    if actor.level == UserLevel.admin:
        return

    closing = (
        db.query(CashClosing)
        .options(joinedload(CashClosing.closed_by))
        .filter(CashClosing.id == closing_id, CashClosing.project_id == project_id)
        .first()
    )
    project = db.get(Project, project_id)
    if not closing or not project:
        return

    context = build_cash_closing_context(db, closing, project)
    _dispatch(
        db,
        project_id,
        ProjectAutomationType.cash_closing,
        context,
        template_fallback=DEFAULT_CASH_CLOSING_TEMPLATE,
    )


def notify_payment_paid(db: Session, project_id: int, payment_id: int) -> None:
    payment = (
        db.query(Payment)
        .options(joinedload(Payment.participant))
        .filter(Payment.id == payment_id, Payment.project_id == project_id)
        .first()
    )
    project = db.get(Project, project_id)
    if not payment or not project:
        return

    context = build_payment_context(db, payment, project)
    _dispatch(
        db,
        project_id,
        ProjectAutomationType.payment_paid,
        context,
        template_fallback=DEFAULT_PAYMENT_PAID_TEMPLATE,
    )


def notify_fine_added(db: Session, project_id: int, fine_id: int) -> None:
    fine = (
        db.query(PeriodFine)
        .options(joinedload(PeriodFine.participant))
        .filter(PeriodFine.id == fine_id, PeriodFine.project_id == project_id)
        .first()
    )
    project = db.get(Project, project_id)
    if not fine or not project:
        return

    context = build_fine_context(db, fine, project)
    _dispatch(
        db,
        project_id,
        ProjectAutomationType.fine_added,
        context,
        template_fallback=DEFAULT_FINE_ADDED_TEMPLATE,
    )


def notify_expense_changed(
    db: Session,
    project_id: int,
    expense: Expense | None,
    *,
    action: str,
    snapshot: dict | None = None,
) -> None:
    project = db.get(Project, project_id)
    if not project:
        return

    if expense is not None:
        context = build_expense_context(db, expense, project, action=action)
    elif snapshot:
        context = build_expense_snapshot_context(project, snapshot, action=action)
    else:
        return

    _dispatch(
        db,
        project_id,
        ProjectAutomationType.expense_changed,
        context,
        template_fallback=DEFAULT_EXPENSE_CHANGED_TEMPLATE,
    )
