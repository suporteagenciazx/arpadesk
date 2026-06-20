"""Salvar relatório da semana — preview e confirmação com pagamentos marcados como pagos."""

from __future__ import annotations

from datetime import date, datetime, timezone

from sqlalchemy.orm import Session, joinedload

from app.models import Expense, Payment, PaymentStatus, Sale, SaleStatus, User
from app.services.cash_closing import ensure_cash_closing_from_import, generate_report_public_id
from app.services.finance import compute_commissions, compute_summary
from app.services.report_import import append_import_log


def _period_payments(db: Session, project_id: int, period_start: date, period_end: date) -> list[Payment]:
    return (
        db.query(Payment)
        .options(joinedload(Payment.participant))
        .filter(
            Payment.project_id == project_id,
            Payment.period_start == period_start,
            Payment.period_end == period_end,
        )
        .order_by(Payment.created_at.asc())
        .all()
    )


def build_report_save_preview(
    db: Session, project_id: int, period_start: date, period_end: date
) -> dict:
    summary = compute_summary(db, project_id, period_start, period_end)
    commissions = summary.get("commissions") or compute_commissions(db, project_id, period_start, period_end)
    commissions_ex_admin = [c for c in commissions if c.get("user_level") != "admin"]
    total_commissions_ex_admin = round(sum(c["commission_amount"] for c in commissions_ex_admin), 2)

    sales = (
        db.query(Sale)
        .options(joinedload(Sale.participant))
        .filter(
            Sale.project_id == project_id,
            Sale.sale_date >= period_start,
            Sale.sale_date <= period_end,
        )
        .order_by(Sale.sale_date.desc(), Sale.created_at.desc())
        .all()
    )
    ok_count = sum(1 for s in sales if s.status == SaleStatus.ok)

    expenses = (
        db.query(Expense)
        .filter(
            Expense.project_id == project_id,
            Expense.expense_date >= period_start,
            Expense.expense_date <= period_end,
        )
        .order_by(Expense.expense_date.desc())
        .all()
    )

    payments = _period_payments(db, project_id, period_start, period_end)

    billing_total = round(sum(float(s.amount) for s in sales), 2)
    expenses_total = round(summary["total_expenses"], 2)
    profit = round(summary["balance"], 2)
    investment = round(abs(expenses_total) + total_commissions_ex_admin, 2)
    roi_percent = round(profit / investment * 100, 2) if investment > 0 else None

    return {
        "period_start": period_start.isoformat(),
        "period_end": period_end.isoformat(),
        "billing_total": billing_total,
        "expenses_total": expenses_total,
        "commissions_paid_ex_admin": total_commissions_ex_admin,
        "profit": profit,
        "sales_count": len(sales),
        "ok_sales_count": ok_count,
        "roi_percent": roi_percent,
        "sales": [
            {
                "id": s.id,
                "sale_code": s.sale_code,
                "participant_name": s.participant.name if s.participant else "",
                "amount": float(s.amount),
                "sale_date": s.sale_date.isoformat() if s.sale_date else None,
                "status": s.status.value,
            }
            for s in sales
        ],
        "expenses": [
            {
                "id": e.id,
                "expense_type": e.expense_type,
                "amount": float(e.amount),
                "notes": e.notes,
                "expense_date": e.expense_date.isoformat() if e.expense_date else None,
            }
            for e in expenses
        ],
        "commissions": commissions_ex_admin,
        "payments": [
            {
                "id": p.id,
                "participant_name": p.participant.name if p.participant else "",
                "final_amount": float(p.final_amount),
                "status": p.status.value,
                "paid_at": p.paid_at.isoformat() if p.paid_at else None,
            }
            for p in payments
        ],
    }


def commit_report_save(
    db: Session,
    project_id: int,
    period_start: date,
    period_end: date,
    user: User,
) -> dict:
    now = datetime.now(timezone.utc)
    payments = _period_payments(db, project_id, period_start, period_end)
    for payment in payments:
        if payment.status != PaymentStatus.pago:
            payment.status = PaymentStatus.pago
            payment.paid_at = now

    existing_participants = {p.participant_id for p in payments}
    commissions = compute_commissions(db, project_id, period_start, period_end)
    for comm in commissions:
        uid = comm["user_id"]
        if uid in existing_participants:
            continue
        amount = float(comm["commission_amount"])
        db.add(
            Payment(
                project_id=project_id,
                participant_id=uid,
                base_amount=amount,
                adjustment_amount=0,
                fine_amount=0,
                fine_percent=0,
                final_amount=amount,
                apply_fine=False,
                status=PaymentStatus.pago,
                period_start=period_start,
                period_end=period_end,
                paid_at=now,
            )
        )

    closing = ensure_cash_closing_from_import(db, project_id, period_start, period_end, user)
    if not closing.report_public_id:
        closing.report_public_id = generate_report_public_id(db, project_id)
    closing.report_tabs_locked = True
    append_import_log(
        db,
        project_id,
        period_start,
        period_end,
        original_filename="Salvar relatório",
        created_by_id=user.id,
    )
    db.commit()
    return build_report_save_preview(db, project_id, period_start, period_end)
