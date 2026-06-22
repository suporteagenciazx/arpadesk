"""Relatório de marketing por período — usa calendário/fechamento do financeiro."""

from __future__ import annotations

from datetime import date

from sqlalchemy.orm import Session

from app.models import Project
from app.services.calendar import report_week_description
from app.services.cash_closing import get_cash_closing
from app.services.finance import compute_summary, pct_change, previous_period
from app.services.marketing_lists import list_week_lists
from app.services.marketing_weeks import _dispatch_stats, _expense_totals
from app.services.project_marketing_config import get_marketing_config


def build_marketing_period_report(
    db: Session,
    project: Project,
    period_start: date,
    period_end: date,
    *,
    expense_mode: str = "marketing",
) -> dict:
    config = get_marketing_config(project)
    marketing_types = config.get("expense_types_marketing") or ["DIVULGACAO"]
    summary = compute_summary(db, project.id, period_start, period_end)
    marketing_exp, all_exp = _expense_totals(
        db, project.id, period_start, period_end, marketing_types
    )
    stats = _dispatch_stats(db, project.id, period_start, period_end)
    closing = get_cash_closing(db, project.id, period_start, period_end)

    investment = marketing_exp if expense_mode == "marketing" else all_exp
    billing = round(float(summary.get("total_sales") or 0), 2)
    profit = round(float(summary.get("balance") or 0), 2)
    clients_received = closing.clients_received if closing else None

    inv_abs = abs(investment)
    roi_percent = round(profit / inv_abs * 100, 2) if inv_abs > 0 else None
    roas_ratio = round(billing / inv_abs, 2) if inv_abs > 0 else None
    cost_per_client = round(inv_abs / clients_received, 2) if clients_received and clients_received > 0 else None

    prev_start, prev_end = previous_period(period_start, period_end)
    prev_clients = None
    prev_investment = None
    prev_billing = None
    prev_profit = None
    if prev_start and prev_end:
        prev_closing = get_cash_closing(db, project.id, prev_start, prev_end)
        prev_clients = prev_closing.clients_received if prev_closing else None
        prev_summary = compute_summary(db, project.id, prev_start, prev_end)
        prev_mexp, prev_aexp = _expense_totals(
            db, project.id, prev_start, prev_end, marketing_types
        )
        prev_investment = prev_mexp if expense_mode == "marketing" else prev_aexp
        prev_billing = round(float(prev_summary.get("total_sales") or 0), 2)
        prev_profit = round(float(prev_summary.get("balance") or 0), 2)

    comparison = {
        "billing_pct": pct_change(billing, prev_billing) if prev_billing is not None else None,
        "investment_pct": pct_change(investment, prev_investment) if prev_investment is not None else None,
        "profit_pct": pct_change(profit, prev_profit) if prev_profit is not None else None,
        "clients_pct": pct_change(clients_received or 0, prev_clients or 0)
        if prev_clients is not None and clients_received is not None
        else None,
    }

    lists = list_week_lists(db, project.id, period_start, period_end)

    return {
        "period_start": period_start.isoformat(),
        "period_end": period_end.isoformat(),
        "description": report_week_description(period_start, period_end),
        "billing_total": billing,
        "investment_total": round(investment, 2),
        "investment_mode": expense_mode,
        "marketing_expenses_total": marketing_exp,
        "all_expenses_total": all_exp,
        "profit": profit,
        "clients_received": clients_received,
        "sms_sent_total": stats["sms_sent_total"],
        "whatsapp_sent_total": stats["whatsapp_sent_total"],
        "messages_sent_total": stats["messages_sent_total"],
        "list_count": stats["list_count"],
        "list_investment_total": stats["list_investment_total"],
        "roi_percent": roi_percent,
        "roas_ratio": roas_ratio,
        "cost_per_client": cost_per_client,
        "report_saved": bool(closing and closing.report_tabs_locked),
        "comparison": comparison,
        "lists": lists,
    }
