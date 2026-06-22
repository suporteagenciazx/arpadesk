"""Dashboard consolidado de Gestão — métricas agregadas por projetos."""

from __future__ import annotations

from datetime import date

from sqlalchemy.orm import Session

from app.models import CashClosing, Payment, PaymentStatus, Project, User, UserLevel
from app.services.finance import compute_commissions, compute_summary


def _paid_commissions_total(
    db: Session,
    project_id: int,
    period_start: date | None,
    period_end: date | None,
) -> float:
    q = (
        db.query(Payment)
        .join(User, Payment.participant_id == User.id)
        .filter(
            Payment.project_id == project_id,
            Payment.status == PaymentStatus.pago,
            User.level != UserLevel.admin,
        )
    )
    if period_start:
        q = q.filter(Payment.period_end >= period_start)
    if period_end:
        q = q.filter(Payment.period_start <= period_end)
    return round(sum(float(p.final_amount or 0) for p in q.all()), 2)


def _investment(summary: dict, commissions: list[dict]) -> float:
    expenses = abs(float(summary.get("total_expenses") or 0))
    comm = sum(
        float(c.get("commission_amount") or 0)
        for c in commissions
        if c.get("user_level") != "admin"
    )
    return round(expenses + comm, 2)


def _performance_metrics(billing: float, profit: float, investment: float) -> tuple[float | None, float | None]:
    roi_percent = round(profit / investment * 100, 2) if investment > 0 else None
    roas_ratio = round(billing / investment, 2) if investment > 0 else None
    return roas_ratio, roi_percent


def build_gestao_dashboard(
    db: Session,
    project_ids: list[int],
    period_start: date | None,
    period_end: date | None,
) -> dict:
    projects = (
        db.query(Project)
        .filter(Project.id.in_(project_ids), Project.is_active.is_(True))
        .order_by(Project.name)
        .all()
    )
    by_project: list[dict] = []
    totals = {
        "billing_total": 0.0,
        "expenses_total": 0.0,
        "investment_total": 0.0,
        "profit_total": 0.0,
        "commissions_paid_total": 0.0,
        "roas_ratio": None,
        "roi_percent": None,
        "cash_closings_count": 0,
    }

    for project in projects:
        summary = compute_summary(db, project.id, period_start, period_end)
        commissions = summary.get("commissions") or compute_commissions(
            db, project.id, period_start, period_end
        )
        billing = float(summary.get("total_sales") or 0)
        expenses = float(summary.get("total_expenses") or 0)
        profit = float(summary.get("balance") or 0)
        investment = _investment(summary, commissions)
        commissions_paid = _paid_commissions_total(db, project.id, period_start, period_end)

        closing_q = db.query(CashClosing).filter(CashClosing.project_id == project.id)
        if period_start:
            closing_q = closing_q.filter(CashClosing.period_end >= period_start)
        if period_end:
            closing_q = closing_q.filter(CashClosing.period_start <= period_end)
        closings_count = closing_q.count()

        totals["billing_total"] = round(totals["billing_total"] + billing, 2)
        totals["expenses_total"] = round(totals["expenses_total"] + expenses, 2)
        totals["investment_total"] = round(totals["investment_total"] + investment, 2)
        totals["profit_total"] = round(totals["profit_total"] + profit, 2)
        totals["commissions_paid_total"] = round(
            totals["commissions_paid_total"] + commissions_paid, 2
        )
        totals["cash_closings_count"] += closings_count

        roas_ratio, roi_percent = _performance_metrics(billing, profit, investment)

        by_project.append(
            {
                "project_id": project.id,
                "project_name": project.name,
                "billing_total": round(billing, 2),
                "expenses_total": round(expenses, 2),
                "investment_total": investment,
                "profit_total": round(profit, 2),
                "commissions_paid_total": commissions_paid,
                "roas_ratio": roas_ratio,
                "roi_percent": roi_percent,
                "cash_closings_count": closings_count,
            }
        )

    totals["roas_ratio"], totals["roi_percent"] = _performance_metrics(
        totals["billing_total"],
        totals["profit_total"],
        totals["investment_total"],
    )

    return {
        "period_start": period_start.isoformat() if period_start else None,
        "period_end": period_end.isoformat() if period_end else None,
        "project_count": len(by_project),
        "totals": totals,
        "by_project": by_project,
    }
