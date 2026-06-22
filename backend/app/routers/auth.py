from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session, joinedload

from app.auth_utils import create_access_token, verify_password
from app.database import get_db
from app.dependencies import get_current_user
from app.models import ProjectMember, User, UserLevel
from app.services.cash_closing import get_user_privilege_codes
from app.services.member_access import assignment_out_from_member, derive_sector_ids_from_memberships
from app.services.user_sectors import get_user_sector_ids
from app.schemas import LoginRequest, TokenResponse, UserOut

router = APIRouter(prefix="/api/auth", tags=["auth"])


def user_to_out(db: Session, user: User) -> UserOut:
    memberships = (
        db.query(ProjectMember)
        .options(joinedload(ProjectMember.project))
        .filter(ProjectMember.user_id == user.id)
        .all()
    )
    projects = []
    for m in memberships:
        if m.project:
            projects.append(assignment_out_from_member(m))
    sector_ids = derive_sector_ids_from_memberships(db, user.id)
    if not sector_ids:
        sector_ids = get_user_sector_ids(db, user.id)
    return UserOut(
        id=user.id,
        name=user.name,
        role_function=user.role_function,
        email=user.email,
        telegram=user.telegram,
        whatsapp=user.whatsapp,
        level=user.level,
        notify_sales=bool(user.notify_sales),
        is_active=user.is_active,
        projects=projects,
        privileges=get_user_privilege_codes(db, user.id),
        sector_ids=sector_ids,
    )


@router.post("/login", response_model=TokenResponse)
def login(data: LoginRequest, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == data.email).first()
    if not user or not user.password_hash or not verify_password(data.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Email ou senha inválidos")
    if user.level == UserLevel.ilustrativo:
        raise HTTPException(status_code=403, detail="Usuários ilustrativos não fazem login")
    if not user.is_active:
        raise HTTPException(status_code=403, detail="Usuário inativo")
    token = create_access_token(user.id, user.level.value)
    return TokenResponse(access_token=token, user=user_to_out(db, user))


@router.get("/me", response_model=UserOut)
def me(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return user_to_out(db, user)
