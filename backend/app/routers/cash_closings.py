from datetime import date

from fastapi import APIRouter, Body, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies import get_current_user, require_admin, user_has_project_access
from app.schemas import CashClosingOut, CashClosingPreviewOut, CashClosingReopenIn, CashClosingResaveOut
from app.services.cash_closing import (
    build_cash_closing_snapshot,
    cancel_cash_closing,
    cash_closing_to_dict,
    confirm_cash_closing,
    create_cash_closing,
    get_cash_closing,
    is_period_frozen_for_user,
    reopen_cash_closing,
    resave_cash_closing,
    unlock_cash_closing,
)

router = APIRouter(prefix="/api/projects/{project_id}/cash-closing", tags=["cash-closing"])


@router.get("/preview", response_model=CashClosingPreviewOut)
def preview_cash_closing(
    project_id: int,
    period_start: str = Query(...),
    period_end: str = Query(...),
    user=Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if not user_has_project_access(db, user, project_id):
        raise HTTPException(403, "Sem acesso")
    ps = date.fromisoformat(period_start)
    pe = date.fromisoformat(period_end)
    snapshot = build_cash_closing_snapshot(db, project_id, ps, pe)
    return CashClosingPreviewOut(**snapshot)


@router.get("", response_model=CashClosingOut | None)
def get_period_cash_closing(
    project_id: int,
    period_start: str = Query(...),
    period_end: str = Query(...),
    user=Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if not user_has_project_access(db, user, project_id):
        raise HTTPException(403, "Sem acesso")
    from app.services.cash_closing import guard_period_access

    guard_period_access(db, user, period_start, period_end)
    ps = date.fromisoformat(period_start)
    pe = date.fromisoformat(period_end)
    closing = get_cash_closing(db, project_id, ps, pe)
    if not closing:
        return None
    data = cash_closing_to_dict(closing)
    data["frozen_for_user"] = is_period_frozen_for_user(db, project_id, ps, pe, user)
    return CashClosingOut(**data)


@router.post("", response_model=CashClosingOut, status_code=201)
def submit_cash_closing(
    project_id: int,
    period_start: str = Query(...),
    period_end: str = Query(...),
    user=Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if not user_has_project_access(db, user, project_id):
        raise HTTPException(403, "Sem acesso")
    ps = date.fromisoformat(period_start)
    pe = date.fromisoformat(period_end)
    closing = create_cash_closing(db, project_id, ps, pe, user)
    data = cash_closing_to_dict(closing)
    data["frozen_for_user"] = is_period_frozen_for_user(db, project_id, ps, pe, user)
    return CashClosingOut(**data)


@router.post("/confirm", response_model=CashClosingOut)
def admin_confirm_cash_closing(
    project_id: int,
    period_start: str = Query(...),
    period_end: str = Query(...),
    admin=Depends(require_admin),
    db: Session = Depends(get_db),
):
    if not user_has_project_access(db, admin, project_id):
        raise HTTPException(403, "Sem acesso")
    ps = date.fromisoformat(period_start)
    pe = date.fromisoformat(period_end)
    closing = confirm_cash_closing(db, project_id, ps, pe, admin)
    data = cash_closing_to_dict(closing)
    data["frozen_for_user"] = False
    return CashClosingOut(**data)


@router.post("/cancel", status_code=204)
def admin_cancel_cash_closing(
    project_id: int,
    period_start: str = Query(...),
    period_end: str = Query(...),
    admin=Depends(require_admin),
    db: Session = Depends(get_db),
):
    if not user_has_project_access(db, admin, project_id):
        raise HTTPException(403, "Sem acesso")
    ps = date.fromisoformat(period_start)
    pe = date.fromisoformat(period_end)
    cancel_cash_closing(db, project_id, ps, pe, admin)


@router.post("/unlock", response_model=CashClosingOut)
def unlock_period_cash_closing(
    project_id: int,
    period_start: str = Query(...),
    period_end: str = Query(...),
    admin=Depends(require_admin),
    db: Session = Depends(get_db),
):
    if not user_has_project_access(db, admin, project_id):
        raise HTTPException(403, "Sem acesso")
    ps = date.fromisoformat(period_start)
    pe = date.fromisoformat(period_end)
    closing = unlock_cash_closing(db, project_id, ps, pe, admin)
    data = cash_closing_to_dict(closing)
    data["frozen_for_user"] = False
    return CashClosingOut(**data)


@router.post("/reopen", response_model=CashClosingOut)
def reopen_period_cash_closing(
    project_id: int,
    period_start: str = Query(...),
    period_end: str = Query(...),
    body: CashClosingReopenIn = Body(...),
    user=Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if not user_has_project_access(db, user, project_id):
        raise HTTPException(403, "Sem acesso")
    ps = date.fromisoformat(period_start)
    pe = date.fromisoformat(period_end)
    closing = reopen_cash_closing(db, project_id, ps, pe, user, body.admin_password, body.scope)
    data = cash_closing_to_dict(closing)
    data["frozen_for_user"] = is_period_frozen_for_user(db, project_id, ps, pe, user)
    return CashClosingOut(**data)


@router.post("/resave", response_model=CashClosingResaveOut)
def resave_period_cash_closing(
    project_id: int,
    period_start: str = Query(...),
    period_end: str = Query(...),
    user=Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if not user_has_project_access(db, user, project_id):
        raise HTTPException(403, "Sem acesso")
    ps = date.fromisoformat(period_start)
    pe = date.fromisoformat(period_end)
    closing, changes = resave_cash_closing(db, project_id, ps, pe, user)
    data = cash_closing_to_dict(closing)
    data["frozen_for_user"] = is_period_frozen_for_user(db, project_id, ps, pe, user)
    return CashClosingResaveOut(closing=CashClosingOut(**data), changes=changes)
