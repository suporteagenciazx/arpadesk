from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session, joinedload

from app.database import get_db
from app.dependencies import get_current_user, user_has_project_access
from app.models import PeriodFine, User
from app.permissions import can_manage_default_fine
from app.schemas import PeriodFineIn, PeriodFineOut

router = APIRouter(prefix="/api/projects/{project_id}/fines", tags=["fines"])


def _fine_out(fine: PeriodFine) -> PeriodFineOut:
    return PeriodFineOut(
        id=fine.id,
        participant_id=fine.participant_id,
        participant_name=fine.participant.name if fine.participant else "",
        period_start=fine.period_start,
        period_end=fine.period_end,
        amount=float(fine.amount),
        notes=fine.notes,
    )


@router.get("", response_model=list[PeriodFineOut])
def list_fines(
    project_id: int,
    period_start: str | None = Query(None),
    period_end: str | None = Query(None),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if not user_has_project_access(db, user, project_id):
        raise HTTPException(403, "Sem acesso")
    q = (
        db.query(PeriodFine)
        .options(joinedload(PeriodFine.participant))
        .filter(PeriodFine.project_id == project_id)
    )
    if period_start:
        q = q.filter(PeriodFine.period_start >= date.fromisoformat(period_start))
    if period_end:
        q = q.filter(PeriodFine.period_end <= date.fromisoformat(period_end))
    fines = q.order_by(PeriodFine.created_at.desc()).all()
    return [_fine_out(f) for f in fines]


@router.post("", response_model=PeriodFineOut, status_code=201)
def upsert_fine(
    project_id: int,
    data: PeriodFineIn,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if not can_manage_default_fine(user):
        raise HTTPException(403, "Sem permissão")
    if not user_has_project_access(db, user, project_id):
        raise HTTPException(403, "Sem acesso")
    if data.amount <= 0:
        raise HTTPException(400, "Valor da multa deve ser maior que zero")

    existing = (
        db.query(PeriodFine)
        .filter(
            PeriodFine.project_id == project_id,
            PeriodFine.participant_id == data.participant_id,
            PeriodFine.period_start == data.period_start,
            PeriodFine.period_end == data.period_end,
        )
        .first()
    )
    if existing:
        existing.amount = data.amount
        existing.notes = data.notes
        existing.created_by_id = user.id
        db.commit()
        db.refresh(existing)
        fine = (
            db.query(PeriodFine)
            .options(joinedload(PeriodFine.participant))
            .filter(PeriodFine.id == existing.id)
            .first()
        )
        return _fine_out(fine)

    fine = PeriodFine(
        project_id=project_id,
        participant_id=data.participant_id,
        period_start=data.period_start,
        period_end=data.period_end,
        amount=data.amount,
        notes=data.notes,
        created_by_id=user.id,
    )
    db.add(fine)
    db.commit()
    fine = (
        db.query(PeriodFine)
        .options(joinedload(PeriodFine.participant))
        .filter(PeriodFine.id == fine.id)
        .first()
    )
    return _fine_out(fine)


@router.delete("/{fine_id}", status_code=204)
def delete_fine(
    project_id: int,
    fine_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if not can_manage_default_fine(user):
        raise HTTPException(403, "Sem permissão")
    fine = db.query(PeriodFine).filter(PeriodFine.id == fine_id, PeriodFine.project_id == project_id).first()
    if not fine:
        raise HTTPException(404, "Multa não encontrada")
    db.delete(fine)
    db.commit()
