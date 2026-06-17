from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session, joinedload

from app.auth_utils import hash_password
from app.database import get_db
from app.dependencies import get_current_user, require_admin
from app.models import Payment, PeriodCommission, PeriodFine, Project, ProjectMember, Sale, User, UserLevel
from app.routers.auth import user_to_out
from app.schemas import UserCreate, UserOut, UserUpdate

router = APIRouter(prefix="/api/users", tags=["users"])


def sync_user_projects(db: Session, user: User, project_ids: list[int], commissions: dict):
    db.query(ProjectMember).filter(ProjectMember.user_id == user.id).delete()
    for pid in project_ids:
        pct = Decimal(str(commissions.get(str(pid), commissions.get(pid, 0))))
        db.add(ProjectMember(project_id=pid, user_id=user.id, commission_percent=pct))


@router.get("", response_model=list[UserOut])
def list_users(_: User = Depends(require_admin), db: Session = Depends(get_db)):
    users = db.query(User).order_by(User.name).all()
    return [user_to_out(db, u) for u in users]


@router.post("", response_model=UserOut, status_code=201)
def create_user(data: UserCreate, _: User = Depends(require_admin), db: Session = Depends(get_db)):
    if data.level != UserLevel.ilustrativo:
        if not data.email or not data.password:
            raise HTTPException(400, "Email e senha obrigatórios para admin/agente")
        if db.query(User).filter(User.email == data.email).first():
            raise HTTPException(400, "Email já cadastrado")
    user = User(
        name=data.name,
        role_function=data.role_function,
        email=data.email,
        telegram=data.telegram,
        whatsapp=data.whatsapp,
        level=data.level,
        password_hash=hash_password(data.password) if data.password else None,
    )
    db.add(user)
    db.flush()
    if data.project_ids:
        sync_user_projects(db, user, data.project_ids, data.project_commissions)
    db.commit()
    db.refresh(user)
    return user_to_out(db, user)


@router.put("/{user_id}", response_model=UserOut)
def update_user(
    user_id: int,
    data: UserUpdate,
    _: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    user = db.get(User, user_id)
    if not user:
        raise HTTPException(404, "Usuário não encontrado")
    for field in ("name", "role_function", "email", "telegram", "whatsapp", "level", "is_active"):
        val = getattr(data, field)
        if val is not None:
            setattr(user, field, val)
    if data.password:
        user.password_hash = hash_password(data.password)
    if data.level == UserLevel.ilustrativo:
        user.password_hash = None
        user.email = None
    if data.project_ids is not None:
        sync_user_projects(db, user, data.project_ids, data.project_commissions or {})
    db.commit()
    db.refresh(user)
    return user_to_out(db, user)


@router.delete("/{user_id}", status_code=204)
def delete_user(user_id: int, admin: User = Depends(require_admin), db: Session = Depends(get_db)):
    user = db.get(User, user_id)
    if not user:
        raise HTTPException(404, "Usuário não encontrado")
    if user.id == admin.id:
        raise HTTPException(400, "Não é possível excluir a si mesmo")

    sales_count = db.query(Sale).filter(Sale.participant_id == user.id).count()
    if sales_count:
        raise HTTPException(
            400,
            f"Usuário vinculado a {sales_count} venda(s). Reatribua ou remova as vendas antes de excluir.",
        )

    payments_count = db.query(Payment).filter(Payment.participant_id == user.id).count()
    if payments_count:
        raise HTTPException(
            400,
            f"Usuário vinculado a {payments_count} pagamento(s). Remova os pagamentos antes de excluir.",
        )

    db.query(PeriodCommission).filter(PeriodCommission.participant_id == user.id).delete(
        synchronize_session=False
    )
    db.query(PeriodFine).filter(PeriodFine.participant_id == user.id).delete(synchronize_session=False)

    db.query(ProjectMember).filter(ProjectMember.user_id == user.id).delete(synchronize_session=False)
    db.delete(user)
    db.commit()
