from datetime import date

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile
from fastapi.responses import Response
from sqlalchemy.orm import Session, joinedload

from app.auth_utils import verify_password
from app.database import get_db
from app.dependencies import get_current_user, user_has_project_access
from app.models import Sale, SaleStatus, User, UserLevel, generate_sale_code
from app.permissions import can_change_sale_status, can_register_sale
from app.schemas import SaleAdminUpdate, SaleAttachmentUrlOut, SaleCreate, SaleDeleteRequest, SaleOut, SaleUpdate
from app.services.storage import (
    StorageError,
    delete_object,
    download_object,
    object_filename,
    presigned_get_url,
    storage_enabled,
    upload_sale_cp,
)
from app.services.telegram_templates import notify_sale_on_ok, notify_sale_registration


def _invalidate_project_cache(project_id: int) -> None:
    from app.services.cache import cache_delete_prefix

    cache_delete_prefix(f"summary:{project_id}:")
    cache_delete_prefix(f"report:{project_id}:")
    cache_delete_prefix(f"commissions:{project_id}:")

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
        has_cp_attachment=bool(s.cp_attachment_url),
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
    from app.services.cash_closing import guard_period_access

    guard_period_access(db, project_id, user, period_start, period_end)
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
    defer_notify: bool = Query(False, description="Aguardar upload do CP antes de notificar Telegram"),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if not user_has_project_access(db, user, project_id):
        raise HTTPException(403, "Sem acesso")
    if not can_register_sale(user):
        raise HTTPException(403, "Sem permissão para registrar vendas")
    from app.services.cash_closing import assert_sales_expenses_writable

    sale_date = data.sale_date or date.today()
    assert_sales_expenses_writable(db, project_id, sale_date, sale_date, user)
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
    _invalidate_project_cache(project_id)
    sale = db.query(Sale).options(joinedload(Sale.participant)).filter(Sale.id == sale.id).first()
    if not defer_notify:
        notify_sale_registration(db, sale.id, project_id)
    return _sale_out(sale)


@router.post("/{sale_id}/attachment", response_model=SaleOut)
async def upload_sale_attachment(
    project_id: int,
    sale_id: int,
    file: UploadFile = File(...),
    notify: bool = Query(True, description="Disparar notificação de registro após anexar"),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if not user_has_project_access(db, user, project_id):
        raise HTTPException(403, "Sem acesso")
    if not can_register_sale(user):
        raise HTTPException(403, "Sem permissão para anexar comprovante")
    if not storage_enabled():
        raise HTTPException(503, "Armazenamento de arquivos não configurado (MinIO/S3)")
    sale = db.query(Sale).filter(Sale.id == sale_id, Sale.project_id == project_id).first()
    if not sale:
        raise HTTPException(404, "Venda não encontrada")
    from app.services.cash_closing import assert_sales_expenses_writable

    assert_sales_expenses_writable(db, project_id, sale.sale_date, sale.sale_date, user)
    try:
        if sale.cp_attachment_url:
            delete_object(sale.cp_attachment_url)
        sale.cp_attachment_url = await upload_sale_cp(project_id, sale_id, file)
        db.commit()
        _invalidate_project_cache(project_id)
    except StorageError as exc:
        raise HTTPException(503, str(exc)) from exc
    if notify:
        notify_sale_registration(db, sale.id, project_id)
    sale = db.query(Sale).options(joinedload(Sale.participant)).filter(Sale.id == sale.id).first()
    return _sale_out(sale)


@router.get("/{sale_id}/attachment", response_model=SaleAttachmentUrlOut)
def get_sale_attachment_url(
    project_id: int,
    sale_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if not user_has_project_access(db, user, project_id):
        raise HTTPException(403, "Sem acesso")
    sale = db.query(Sale).filter(Sale.id == sale_id, Sale.project_id == project_id).first()
    if not sale:
        raise HTTPException(404, "Venda não encontrada")
    if not sale.cp_attachment_url:
        raise HTTPException(404, "Venda sem comprovante anexado")
    if not storage_enabled():
        raise HTTPException(503, "Armazenamento de arquivos não configurado")
    try:
        url = presigned_get_url(sale.cp_attachment_url)
    except StorageError as exc:
        raise HTTPException(503, str(exc)) from exc
    return SaleAttachmentUrlOut(url=url)


@router.get("/{sale_id}/attachment/download")
def download_sale_attachment(
    project_id: int,
    sale_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if not user_has_project_access(db, user, project_id):
        raise HTTPException(403, "Sem acesso")
    sale = db.query(Sale).filter(Sale.id == sale_id, Sale.project_id == project_id).first()
    if not sale:
        raise HTTPException(404, "Venda não encontrada")
    if not sale.cp_attachment_url:
        raise HTTPException(404, "Venda sem comprovante anexado")
    if not storage_enabled():
        raise HTTPException(503, "Armazenamento de arquivos não configurado")
    try:
        body, content_type = download_object(sale.cp_attachment_url)
    except StorageError as exc:
        raise HTTPException(503, str(exc)) from exc
    filename = object_filename(sale.cp_attachment_url)
    return Response(
        content=body,
        media_type=content_type,
        headers={"Content-Disposition": f'inline; filename="{filename}"'},
    )


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
    if data.status is not None and not can_change_sale_status(db, user, project_id):
        raise HTTPException(403, "Apenas o financeiro pode alterar o status da venda")
    sale = db.query(Sale).filter(Sale.id == sale_id, Sale.project_id == project_id).first()
    if not sale:
        raise HTTPException(404, "Venda não encontrada")
    from app.services.cash_closing import assert_sales_expenses_writable

    assert_sales_expenses_writable(db, project_id, sale.sale_date, sale.sale_date, user)
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
    _invalidate_project_cache(project_id)
    if data.status is not None and previous_status != sale.status:
        notify_sale_on_ok(db, sale.id, project_id)
    sale = db.query(Sale).options(joinedload(Sale.participant)).filter(Sale.id == sale.id).first()
    return _sale_out(sale)


@router.post("/{sale_id}/admin-update", response_model=SaleOut)
def admin_update_sale(
    project_id: int,
    sale_id: int,
    data: SaleAdminUpdate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if not user_has_project_access(db, user, project_id):
        raise HTTPException(403, "Sem acesso")
    from app.services.cash_closing import assert_sales_expenses_writable, verify_admin_password

    verify_admin_password(db, data.admin_password)
    sale = db.query(Sale).filter(Sale.id == sale_id, Sale.project_id == project_id).first()
    if not sale:
        raise HTTPException(404, "Venda não encontrada")
    assert_sales_expenses_writable(db, project_id, sale.sale_date, sale.sale_date, user)
    for field in (
        "participant_id",
        "cnpj",
        "phone",
        "sale_version",
        "doc_type",
        "doc_custom",
        "amount",
        "sale_date",
    ):
        val = getattr(data, field)
        if val is not None:
            setattr(sale, field, val)
    if data.doc_type and data.doc_type.upper() != "OUTROS":
        sale.doc_custom = None
    db.commit()
    _invalidate_project_cache(project_id)
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
    from app.services.cash_closing import assert_sales_expenses_writable

    assert_sales_expenses_writable(db, project_id, sale.sale_date, sale.sale_date, user)
    if sale.cp_attachment_url:
        delete_object(sale.cp_attachment_url)
    db.delete(sale)
    db.commit()
    _invalidate_project_cache(project_id)
