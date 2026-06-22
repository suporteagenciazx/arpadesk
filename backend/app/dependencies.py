from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from app.auth_utils import decode_access_token
from app.database import get_db
from app.models import User, UserLevel

security = HTTPBearer(auto_error=False)


def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(security),
    db: Session = Depends(get_db),
) -> User:
    if not credentials:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Não autenticado")
    try:
        payload = decode_access_token(credentials.credentials)
        user_id = int(payload["sub"])
    except Exception:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token inválido")
    user = db.get(User, user_id)
    if not user or not user.is_active:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Usuário inválido")
    if user.level == UserLevel.ilustrativo:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Usuário ilustrativo não acessa o sistema")
    return user


def require_admin(user: User = Depends(get_current_user)) -> User:
    if user.level != UserLevel.admin:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Apenas administradores")
    return user


def require_admin_finance(user: User = Depends(get_current_user)) -> User:
    if user.level != UserLevel.admin:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Acesso restrito ao administrador")
    return user


def require_payments_access(
    project_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> User:
    from app.permissions import can_access_payments

    if not user_has_project_access(db, user, project_id):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Sem acesso")
    if not can_access_payments(db, user, project_id):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Sem acesso a pagamentos")
    return user


def user_has_project_access(db: Session, user: User, project_id: int) -> bool:
    if user.level == UserLevel.admin:
        return True
    from app.models import ProjectMember

    return (
        db.query(ProjectMember)
        .filter(ProjectMember.project_id == project_id, ProjectMember.user_id == user.id)
        .first()
        is not None
    )
