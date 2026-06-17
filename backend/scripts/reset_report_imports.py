"""Remove importações antigas e mantém apenas dados da semana operacional atual."""

from datetime import date

from app.database import SessionLocal
from app.models import (
    PeriodCommission,
    ProjectMember,
    ReportImport,
    ReportImportLog,
    User,
    UserLevel,
)
from app.services.cache import cache_delete_prefix
from app.services.calendar import operational_week_range
from app.services.storage import delete_object

IMPORT_ILUSTRATIVO_PREFIXES = ("ATD ", "Don", "Contador 02")


def reset_old_report_imports(project_id: int = 1) -> dict:
    db = SessionLocal()
    today = date.today()
    week_start, week_end = operational_week_range(today)
    removed = {
        "imports": 0,
        "logs": 0,
        "period_commissions": 0,
        "ilustrativos": 0,
        "pdfs_deleted": 0,
    }

    try:
        imports = (
            db.query(ReportImport)
            .filter(
                ReportImport.project_id == project_id,
                (ReportImport.period_start != week_start) | (ReportImport.period_end != week_end),
            )
            .all()
        )
        for imp in imports:
            if imp.pdf_object_key:
                delete_object(imp.pdf_object_key)
                removed["pdfs_deleted"] += 1
            db.delete(imp)
            removed["imports"] += 1

        logs = (
            db.query(ReportImportLog)
            .filter(
                ReportImportLog.project_id == project_id,
                (ReportImportLog.period_start != week_start) | (ReportImportLog.period_end != week_end),
            )
            .all()
        )
        for log in logs:
            db.delete(log)
            removed["logs"] += 1

        pc_deleted = (
            db.query(PeriodCommission)
            .filter(
                PeriodCommission.project_id == project_id,
                (PeriodCommission.period_start != week_start) | (PeriodCommission.period_end != week_end),
            )
            .delete(synchronize_session=False)
        )
        removed["period_commissions"] = pc_deleted

        illus_users = db.query(User).filter(User.level == UserLevel.ilustrativo).all()
        for user in illus_users:
            name = (user.name or "").strip()
            if any(name.upper().startswith(p.upper()) or name == p for p in IMPORT_ILUSTRATIVO_PREFIXES):
                if name.upper().startswith("ATD") or name == "Don" or name.startswith("Contador"):
                    db.query(PeriodCommission).filter(PeriodCommission.participant_id == user.id).delete(
                        synchronize_session=False
                    )
                    db.query(ProjectMember).filter(ProjectMember.user_id == user.id).delete(
                        synchronize_session=False
                    )
                    db.delete(user)
                    removed["ilustrativos"] += 1

        db.commit()
        cache_delete_prefix(f"report:{project_id}:")
        cache_delete_prefix(f"summary:{project_id}:")
        cache_delete_prefix(f"commissions:{project_id}:")
        return {"week_start": week_start.isoformat(), "week_end": week_end.isoformat(), **removed}
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


if __name__ == "__main__":
    result = reset_old_report_imports()
    print(result)
