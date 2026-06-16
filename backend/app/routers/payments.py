from datetime import date, datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session, joinedload

from app.database import get_db
from app.dependencies import get_current_user, require_payments_access, user_has_project_access
from app.permissions import can_access_payments
from app.models import Payment, PaymentStatus, ProjectPaymentSettings, User, UserLevel
from app.schemas import PaymentCreate, PaymentOut
from app.services.finance import compute_commissions

router = APIRouter(prefix="/api/projects/{project_id}/payments", tags=["payments"])


def _destination(ps: ProjectPaymentSettings | None) -> dict | None:
    if not ps:
        return None
    if ps.payment_type.value == "pix":
        return {"type": "pix", "pix_key": ps.pix_key, "pix_qr": ps.pix_qr}
    return {
        "type": "crypto",
        "address": ps.crypto_address,
        "network": ps.crypto_network,
        "qr": ps.crypto_qr,
    }


def _calc_final(base: float, adjustment: float, apply_fine: bool, fine_pct: float) -> tuple[float, float, float]:
    fine_amt = round(base * fine_pct / 100, 2) if apply_fine else 0
    final = round(base + adjustment - fine_amt, 2)
    return fine_amt, final


def _payment_out(p: Payment, ps: ProjectPaymentSettings | None) -> PaymentOut:
    return PaymentOut(
        id=p.id,
        participant_id=p.participant_id,
        participant_name=p.participant.name if p.participant else "",
        base_amount=float(p.base_amount),
        adjustment_amount=float(p.adjustment_amount or 0),
        fine_percent=float(p.fine_percent),
        fine_amount=float(p.fine_amount),
        final_amount=float(p.final_amount),
        apply_fine=p.apply_fine,
        status=p.status,
        period_start=p.period_start,
        period_end=p.period_end,
        paid_at=p.paid_at,
        notes=p.notes,
        payment_destination=_destination(ps),
    )


@router.get("", response_model=list[PaymentOut])
def list_payments(
    project_id: int,
    period_start: str | None = Query(None),
    period_end: str | None = Query(None),
    user: User = Depends(require_payments_access),
    db: Session = Depends(get_db),
):
    if not user_has_project_access(db, user, project_id):
        raise HTTPException(403, "Sem acesso")
    ps = db.query(ProjectPaymentSettings).filter(ProjectPaymentSettings.project_id == project_id).first()
    payments_q = (
        db.query(Payment)
        .options(joinedload(Payment.participant))
        .filter(Payment.project_id == project_id)
    )
    if period_start:
        payments_q = payments_q.filter(Payment.period_start >= date.fromisoformat(period_start))
    if period_end:
        payments_q = payments_q.filter(Payment.period_end <= date.fromisoformat(period_end))
    payments = payments_q.order_by(Payment.created_at.desc()).all()
    return [_payment_out(p, ps) for p in payments]


@router.get("/commissions")
def payment_commissions(
    project_id: int,
    period_start: str | None = Query(None),
    period_end: str | None = Query(None),
    user: User = Depends(require_payments_access),
    db: Session = Depends(get_db),
):
    if not user_has_project_access(db, user, project_id):
        raise HTTPException(403, "Sem acesso")
    ps_date = date.fromisoformat(period_start) if period_start else None
    pe_date = date.fromisoformat(period_end) if period_end else None
    return {"commissions": compute_commissions(db, project_id, ps_date, pe_date)}


@router.get("/preview")
def payment_preview(
    project_id: int,
    period_start: str | None = Query(None),
    period_end: str | None = Query(None),
    user: User = Depends(require_payments_access),
    db: Session = Depends(get_db),
):
    if not user_has_project_access(db, user, project_id):
        raise HTTPException(403, "Sem acesso")
    ps = db.query(ProjectPaymentSettings).filter(ProjectPaymentSettings.project_id == project_id).first()
    if not ps:
        raise HTTPException(400, "Configure destino de pagamento antes do primeiro pagamento")
    ps_date = date.fromisoformat(period_start) if period_start else None
    pe_date = date.fromisoformat(period_end) if period_end else None
    commissions = compute_commissions(db, project_id, ps_date, pe_date)
    return {
        "commissions": commissions,
        "payment_destination": _destination(ps),
        "default_fine_percent": float(ps.default_fine_percent or 0),
    }


@router.post("", response_model=PaymentOut, status_code=201)
def create_payment(
    project_id: int,
    data: PaymentCreate,
    user: User = Depends(require_payments_access),
    db: Session = Depends(get_db),
):
    if not user_has_project_access(db, user, project_id):
        raise HTTPException(403, "Sem acesso")
    ps = db.query(ProjectPaymentSettings).filter(ProjectPaymentSettings.project_id == project_id).first()
    if not ps:
        raise HTTPException(400, "Configure destino de pagamento (PIX ou Cripto) antes do primeiro pagamento")
    fine_pct = data.fine_percent if data.fine_percent is not None else float(ps.default_fine_percent or 0)
    adjustment = float(data.adjustment_amount or 0)
    fine_amt, final = _calc_final(data.base_amount, adjustment, data.apply_fine, fine_pct)
    payment = Payment(
        project_id=project_id,
        participant_id=data.participant_id,
        base_amount=data.base_amount,
        adjustment_amount=adjustment,
        fine_percent=fine_pct if data.apply_fine else 0,
        fine_amount=fine_amt,
        final_amount=final,
        apply_fine=data.apply_fine,
        period_start=data.period_start,
        period_end=data.period_end,
        notes=data.notes,
    )
    db.add(payment)
    db.commit()
    payment = db.query(Payment).options(joinedload(Payment.participant)).filter(Payment.id == payment.id).first()
    return _payment_out(payment, ps)


@router.patch("/{payment_id}/mark-paid", response_model=PaymentOut)
def mark_paid(
    project_id: int,
    payment_id: int,
    user: User = Depends(require_payments_access),
    db: Session = Depends(get_db),
):
    ps = db.query(ProjectPaymentSettings).filter(ProjectPaymentSettings.project_id == project_id).first()
    payment = db.query(Payment).options(joinedload(Payment.participant)).filter(
        Payment.id == payment_id, Payment.project_id == project_id
    ).first()
    if not payment:
        raise HTTPException(404, "Pagamento não encontrado")
    payment.status = PaymentStatus.pago
    payment.paid_at = datetime.now(timezone.utc)
    db.commit()
    return _payment_out(payment, ps)
