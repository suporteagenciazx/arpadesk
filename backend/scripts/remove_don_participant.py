"""Remove Don (administrador) de comissões, pagamentos, relatório importado e cadastro de usuários."""

from datetime import date

from app.database import SessionLocal
from app.models import (
    Payment,
    PeriodCommission,
    PeriodFine,
    ProjectMember,
    ReportImport,
    Sale,
    User,
)
from app.services.cache import cache_delete_prefix
from app.services.report_import import is_administrator_report_label, purge_administrator_from_extracted


def remove_don_participant(
    project_id: int = 1,
    period_start: date | None = None,
    period_end: date | None = None,
) -> dict:
    db = SessionLocal()
    removed = {
        "users": 0,
        "period_commissions": 0,
        "payments": 0,
        "report_imports_purged": 0,
    }

    try:
        don_users = [
            u
            for u in db.query(User).all()
            if is_administrator_report_label(u.name or "") or (u.name or "").strip() == "Don"
        ]

        for user in don_users:
            pc_q = db.query(PeriodCommission).filter(PeriodCommission.participant_id == user.id)
            pay_q = db.query(Payment).filter(Payment.participant_id == user.id)
            if period_start:
                pc_q = pc_q.filter(PeriodCommission.period_start == period_start)
                pay_q = pay_q.filter(Payment.period_start == period_start)
            if period_end:
                pc_q = pc_q.filter(PeriodCommission.period_end == period_end)
                pay_q = pay_q.filter(Payment.period_end == period_end)

            removed["period_commissions"] += pc_q.delete(synchronize_session=False)
            removed["payments"] += pay_q.delete(synchronize_session=False)

            remaining_payments = db.query(Payment).filter(Payment.participant_id == user.id).count()
            remaining_sales = db.query(Sale).filter(Sale.participant_id == user.id).count()
            if remaining_payments == 0 and remaining_sales == 0:
                db.query(PeriodCommission).filter(PeriodCommission.participant_id == user.id).delete(
                    synchronize_session=False
                )
                db.query(PeriodFine).filter(PeriodFine.participant_id == user.id).delete(
                    synchronize_session=False
                )
                db.query(ProjectMember).filter(ProjectMember.user_id == user.id).delete(
                    synchronize_session=False
                )
                db.delete(user)
                removed["users"] += 1

        imports_q = db.query(ReportImport).filter(ReportImport.project_id == project_id)
        if period_start:
            imports_q = imports_q.filter(ReportImport.period_start == period_start)
        if period_end:
            imports_q = imports_q.filter(ReportImport.period_end == period_end)

        for imp in imports_q.all():
            if not imp.extracted_data:
                continue
            cleaned = purge_administrator_from_extracted(imp.extracted_data)
            if cleaned != imp.extracted_data:
                imp.extracted_data = cleaned
                removed["report_imports_purged"] += 1

        db.commit()
        cache_delete_prefix(f"report:{project_id}:")
        cache_delete_prefix(f"summary:{project_id}:")
        cache_delete_prefix(f"commissions:{project_id}:")
        return removed
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


if __name__ == "__main__":
    result = remove_don_participant(
        project_id=1,
        period_start=date(2025, 11, 10),
        period_end=date(2025, 11, 14),
    )
    print(result)
