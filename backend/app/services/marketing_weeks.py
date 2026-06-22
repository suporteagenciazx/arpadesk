"""Semanas de campanha — agrega financeiro + disparos + clientes recebidos."""

from __future__ import annotations

from datetime import date

from sqlalchemy.orm import Session, joinedload

from app.models import CashClosing, Expense, MarketingDispatch, MarketingList, Project, ReportImportLog, User
from app.services.calendar import report_week_description
from app.services.cash_closing import get_cash_closing
from app.services.finance import compute_summary
from app.services.project_marketing_config import get_marketing_config


def _collect_periods(db: Session, project_id: int) -> list[tuple[date, date]]:
    seen: set[tuple[date, date]] = set()
    periods: list[tuple[date, date]] = []

    def add(ps: date, pe: date) -> None:
        key = (ps, pe)
        if key not in seen:
            seen.add(key)
            periods.append(key)

    for row in (
        db.query(CashClosing.period_start, CashClosing.period_end)
        .filter(CashClosing.project_id == project_id)
        .all()
    ):
        add(row.period_start, row.period_end)

    for row in (
        db.query(ReportImportLog.period_start, ReportImportLog.period_end)
        .filter(ReportImportLog.project_id == project_id)
        .all()
    ):
        add(row.period_start, row.period_end)

    for row in (
        db.query(MarketingDispatch.period_start, MarketingDispatch.period_end)
        .filter(MarketingDispatch.project_id == project_id)
        .all()
    ):
        add(row.period_start, row.period_end)

    periods.sort(key=lambda p: p[0], reverse=True)
    return periods


def _expense_totals(
    db: Session, project_id: int, period_start: date, period_end: date, marketing_types: list[str]
) -> tuple[float, float]:
    expenses = (
        db.query(Expense)
        .filter(
            Expense.project_id == project_id,
            Expense.expense_date >= period_start,
            Expense.expense_date <= period_end,
        )
        .all()
    )
    all_total = round(sum(float(e.amount) for e in expenses), 2)
    marketing_total = round(
        sum(float(e.amount) for e in expenses if e.expense_type in marketing_types),
        2,
    )
    return marketing_total, all_total


def _dispatch_stats(db: Session, project_id: int, period_start: date, period_end: date) -> dict:
    dispatches = (
        db.query(MarketingDispatch)
        .options(joinedload(MarketingDispatch.lists))
        .filter(
            MarketingDispatch.project_id == project_id,
            MarketingDispatch.period_start == period_start,
            MarketingDispatch.period_end == period_end,
        )
        .all()
    )
    sms_count = 0
    whatsapp_count = 0
    list_investment = 0.0
    list_count = 0
    for d in dispatches:
        for lst in d.lists:
            list_count += 1
            list_investment += float(lst.investment_amount or 0)
            if d.channel.value == "whatsapp":
                whatsapp_count += int(lst.message_count or 0)
            else:
                sms_count += int(lst.message_count or 0)
    return {
        "dispatch_count": len(dispatches),
        "list_count": list_count,
        "sms_sent_total": sms_count,
        "whatsapp_sent_total": whatsapp_count,
        "messages_sent_total": sms_count + whatsapp_count,
        "list_investment_total": round(list_investment, 2),
    }


def list_marketing_weeks(
    db: Session, project: Project, *, expense_mode: str = "marketing"
) -> list[dict]:
    config = get_marketing_config(project)
    marketing_types = config.get("expense_types_marketing") or ["DIVULGACAO"]
    rows: list[dict] = []

    for period_start, period_end in _collect_periods(db, project.id):
        closing = get_cash_closing(db, project.id, period_start, period_end)
        summary = compute_summary(db, project.id, period_start, period_end)
        marketing_exp, all_exp = _expense_totals(
            db, project.id, period_start, period_end, marketing_types
        )
        stats = _dispatch_stats(db, project.id, period_start, period_end)
        investment = marketing_exp if expense_mode == "marketing" else all_exp

        rows.append(
            {
                "period_start": period_start.isoformat(),
                "period_end": period_end.isoformat(),
                "description": report_week_description(period_start, period_end),
                "month_label": period_start.strftime("%m/%Y"),
                "clients_received": closing.clients_received if closing else None,
                "clients_received_editable": True,
                "sms_sent_total": stats["sms_sent_total"],
                "whatsapp_sent_total": stats["whatsapp_sent_total"],
                "messages_sent_total": stats["messages_sent_total"],
                "dispatch_count": stats["dispatch_count"],
                "list_count": stats["list_count"],
                "investment_amount": investment,
                "investment_mode": expense_mode,
                "marketing_expenses_total": marketing_exp,
                "all_expenses_total": all_exp,
                "billing_total": round(float(summary.get("total_sales") or 0), 2),
                "profit": round(float(summary.get("balance") or 0), 2),
                "report_saved": bool(closing and closing.report_tabs_locked),
                "cash_closing_id": closing.id if closing else None,
            }
        )

    return rows


def set_clients_received(
    db: Session,
    project_id: int,
    period_start: date,
    period_end: date,
    clients_received: int | None,
    user: User,
) -> dict:
    from app.models import CashClosingStatus

    closing = get_cash_closing(db, project_id, period_start, period_end)
    if not closing:
        closing = CashClosing(
            project_id=project_id,
            period_start=period_start,
            period_end=period_end,
            closed_by_id=user.id,
            summary_snapshot={},
            status=CashClosingStatus.confirmed,
            confirmed_by_id=user.id,
        )
        db.add(closing)
    closing.clients_received = clients_received
    db.commit()
    db.refresh(closing)
    return {"clients_received": closing.clients_received}
