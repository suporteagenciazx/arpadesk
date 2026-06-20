from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies import require_admin_finance, user_has_project_access
from app.models import User
from app.schemas import ReportSavePreviewOut
from app.services.report_save import build_report_save_preview, commit_report_save

router = APIRouter(prefix="/api/projects/{project_id}/report-save", tags=["report-save"])


@router.get("/preview", response_model=ReportSavePreviewOut)
def preview_report_save(
    project_id: int,
    period_start: str = Query(...),
    period_end: str = Query(...),
    user: User = Depends(require_admin_finance),
    db: Session = Depends(get_db),
):
    if not user_has_project_access(db, user, project_id):
        raise HTTPException(403, "Sem acesso")
    ps = date.fromisoformat(period_start)
    pe = date.fromisoformat(period_end)
    return ReportSavePreviewOut(**build_report_save_preview(db, project_id, ps, pe))


@router.post("", response_model=ReportSavePreviewOut)
def save_weekly_report(
    project_id: int,
    period_start: str = Query(...),
    period_end: str = Query(...),
    user: User = Depends(require_admin_finance),
    db: Session = Depends(get_db),
):
    if not user_has_project_access(db, user, project_id):
        raise HTTPException(403, "Sem acesso")
    ps = date.fromisoformat(period_start)
    pe = date.fromisoformat(period_end)
    data = commit_report_save(db, project_id, ps, pe, user)
    from app.services.cache import cache_delete_prefix

    cache_delete_prefix(f"summary:{project_id}:")
    cache_delete_prefix(f"report:{project_id}:")
    cache_delete_prefix(f"commissions:{project_id}:")
    return ReportSavePreviewOut(**data)
