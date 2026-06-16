from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session, joinedload

from app.auth_utils import verify_password
from app.database import get_db
from app.dependencies import get_current_user, user_has_project_access
from app.models import Sale, SaleStatus, User, UserLevel, generate_sale_code
from app.permissions import can_change_sale_status, can_register_sale
from app.schemas import SaleCreate, SaleDeleteRequest, SaleOut, SaleUpdate
from app.services.telegram_templates import notify_sale_on_ok, notify_sale_registration

router = APIRouter(prefix="/api/projects/{project_id}/sales", tags=["sales"])


def _sale_out(s: Sale) -> SaleOut:
    return SaleOut(
        id=s.id,
        sale_code=s.sale_code,
        participant_id=s.participant_id,
        participant_name=s.participant.name if s.participant else "",
        cnpj=s.cnpj,
        phone=s.phone,
        sale_version=s.sale_version,
        doc_type=s.doc_type,
        doc_custom=s.doc_custom,
        amount=float(s.amount),
        status=s.status,
        sale_date=s.sale_date,
        cp_attachment_url=s.cp_attachment_url,
        created_at=s.created_at,
    )


@router.get("", response_model=list[SaleOut])
def list_sales(
    project_id: int,
    period_start: str | None = Query(None),
    period_end: str | None = Query(None),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if not user_has_project_access(db, user, project_id):
        raise HTTPException(403, "Sem acesso")
    sales_q = (
        db.query(Sale)
        .options(joinedload(Sale.participant))
        .filter(Sale.project_id == project_id)
    )
    if period_start:
        sales_q = sales_q.filter(Sale.sale_date >= date.fromisoformat(period_start))
    if period_end:
        sales_q = sales_q.filter(Sale.sale_date <= date.fromisoformat(period_end))
    sales = sales_q.order_by(Sale.created_at.desc()).all()
    return [_sale_out(s) for s in sales]


@router.post("", response_model=SaleOut, status_code=201)
def create_sale(
    project_id: int,
    data: SaleCreate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if not user_has_project_access(db, user, project_id):
        raise HTTPException(403, "Sem acesso")
    if not can_register_sale(user):
        raise HTTPException(403, "Sem permissão para registrar vendas")
    code = generate_sale_code()
    while db.query(Sale).filter(Sale.project_id == project_id, Sale.sale_code == code).first():
        code = generate_sale_code()
    sale = Sale(
        project_id=project_id,
        participant_id=data.participant_id,
        sale_code=code,
        cnpj=data.cnpj,
        phone=data.phone,
        sale_version=data.sale_version,
        doc_type=data.doc_type,
        doc_custom=data.doc_custom if data.doc_type.upper() == "OUTROS" else None,
        amount=data.amount,
        status=SaleStatus.pendente,
        sale_date=data.sale_date or date.today(),
        cp_attachment_url=data.cp_attachment_url,
        created_by_id=user.id,
    )
    db.add(sale)
    db.commit()
    db.refresh(sale)
    sale = db.query(Sale).options(joinedload(Sale.participant)).filter(Sale.id == sale.id).first()
    notify_sale_registration(db, sale.id, project_id)
    return _sale_out(sale)


@router.patch("/{sale_id}", response_model=SaleOut)
def update_sale(
    project_id: int,
    sale_id: int,
    data: SaleUpdate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if not user_has_project_access(db, user, project_id):
        raise HTTPException(403, "Sem acesso")
    if data.status is not None and not can_change_sale_status(user):
        raise HTTPException(403, "Apenas o financeiro pode alterar o status da venda")
    sale = db.query(Sale).filter(Sale.id == sale_id, Sale.project_id == project_id).first()
    if not sale:
        raise HTTPException(404, "Venda não encontrada")
    previous_status = sale.status
    for field in (
        "participant_id",
        "cnpj",
        "phone",
        "sale_version",
        "doc_type",
        "doc_custom",
        "amount",
        "status",
        "sale_date",
        "cp_attachment_url",
    ):
        val = getattr(data, field)
        if val is not None:
            setattr(sale, field, val)
    if data.doc_type and data.doc_type.upper() != "OUTROS":
        sale.doc_custom = None
    db.commit()
    if data.status is not None and previous_status != sale.status:
        notify_sale_on_ok(db, sale.id, project_id)
    sale = db.query(Sale).options(joinedload(Sale.participant)).filter(Sale.id == sale.id).first()
    return _sale_out(sale)


@router.post("/{sale_id}/delete", status_code=204)
def delete_sale(
    project_id: int,
    sale_id: int,
    data: SaleDeleteRequest,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if not user_has_project_access(db, user, project_id):
        raise HTTPException(403, "Sem acesso")
    admins = (
        db.query(User)
        .filter(User.level == UserLevel.admin, User.is_active.is_(True))
        .all()
    )
    verified = any(
        a.password_hash and verify_password(data.admin_password, a.password_hash) for a in admins
    )
    if not verified:
        raise HTTPException(403, "Senha de administrador incorreta")
    sale = db.query(Sale).filter(Sale.id == sale_id, Sale.project_id == project_id).first()
    if not sale:
        raise HTTPException(404, "Venda não encontrada")
    db.delete(sale)
    db.commit()
