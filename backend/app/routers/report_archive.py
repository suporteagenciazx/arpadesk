from datetime import date

from fastapi import APIRouter, Body, Depends, HTTPException, Query
from fastapi.responses import Response
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies import require_admin_finance, user_has_project_access
from app.schemas import CashClosingOut, ReportArchiveReopenIn, ReportArchiveRowOut
from app.services.cash_closing import cash_closing_to_dict, is_period_frozen_for_user, verify_admin_password
from app.services.report_archive import (
    cancel_report_edit,
    list_report_archive,
    reopen_saved_report_for_edit,
)
from app.services.report_pdf_export import generate_report_pdf

router = APIRouter(prefix="/api/projects/{project_id}/report-archive", tags=["report-archive"])


@router.get("", response_model=list[ReportArchiveRowOut])
def get_report_archive(
    project_id: int,
    user=Depends(require_admin_finance),
    db: Session = Depends(get_db),
):
    if not user_has_project_access(db, user, project_id):
        raise HTTPException(403, "Sem acesso")
    return [ReportArchiveRowOut(**row) for row in list_report_archive(db, project_id)]


@router.get("/pdf")
def download_report_archive_pdf(
    project_id: int,
    period_start: str = Query(...),
    period_end: str = Query(...),
    user=Depends(require_admin_finance),
    db: Session = Depends(get_db),
):
    if not user_has_project_access(db, user, project_id):
        raise HTTPException(403, "Sem acesso")
    ps = date.fromisoformat(period_start)
    pe = date.fromisoformat(period_end)
    try:
        pdf_bytes = generate_report_pdf(db, project_id, ps, pe)
    except Exception as exc:
        raise HTTPException(500, f"Erro ao gerar PDF: {exc}") from exc
    filename = f"relatorio_{period_start}_{period_end}.pdf"
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.post("/reopen-for-edit", response_model=CashClosingOut)
def reopen_report_for_edit(
    project_id: int,
    period_start: str = Query(...),
    period_end: str = Query(...),
    body: ReportArchiveReopenIn = Body(...),
    user=Depends(require_admin_finance),
    db: Session = Depends(get_db),
):
    if not user_has_project_access(db, user, project_id):
        raise HTTPException(403, "Sem acesso")
    verify_admin_password(db, body.admin_password)
    ps = date.fromisoformat(period_start)
    pe = date.fromisoformat(period_end)
    closing = reopen_saved_report_for_edit(db, project_id, ps, pe, user)
    data = cash_closing_to_dict(closing)
    data["frozen_for_user"] = is_period_frozen_for_user(db, project_id, ps, pe, user)
    return CashClosingOut(**data)


@router.post("/cancel-edit", response_model=CashClosingOut)
def cancel_report_edit_route(
    project_id: int,
    period_start: str = Query(...),
    period_end: str = Query(...),
    user=Depends(require_admin_finance),
    db: Session = Depends(get_db),
):
    if not user_has_project_access(db, user, project_id):
        raise HTTPException(403, "Sem acesso")
    ps = date.fromisoformat(period_start)
    pe = date.fromisoformat(period_end)
    closing = cancel_report_edit(db, project_id, ps, pe)
    data = cash_closing_to_dict(closing)
    data["frozen_for_user"] = is_period_frozen_for_user(db, project_id, ps, pe, user)
    return CashClosingOut(**data)
