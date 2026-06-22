from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session, joinedload

from app.database import get_db
from app.dependencies import require_admin
from app.models import Project, ProjectMember, User, UserLevel
from app.schemas import ProjectPermissionMemberOut, ProjectPermissionPatch
from app.services.member_access import (
    access_config_to_sector_list,
    get_membership,
    update_member_project_access,
)

router = APIRouter(prefix="/api/projects/{project_id}/permissions", tags=["project-permissions"])


def _member_out(member: ProjectMember) -> ProjectPermissionMemberOut:
    user = member.user
    return ProjectPermissionMemberOut(
        user_id=member.user_id,
        user_name=user.name if user else "",
        user_level=user.level if user else UserLevel.agente,
        user_email=user.email if user else None,
        commission_percent=float(member.commission_percent or 0),
        sectors=access_config_to_sector_list(member.access_config),
    )


@router.get("", response_model=list[ProjectPermissionMemberOut])
def list_project_permissions(
    project_id: int,
    _: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    project = db.get(Project, project_id)
    if not project or not project.is_active:
        raise HTTPException(404, "Projeto não encontrado")
    rows = (
        db.query(ProjectMember)
        .options(joinedload(ProjectMember.user))
        .filter(ProjectMember.project_id == project_id)
        .order_by(ProjectMember.id)
        .all()
    )
    result = []
    for row in rows:
        if not row.user:
            continue
        if row.user.level in (UserLevel.admin, UserLevel.ilustrativo):
            continue
        result.append(_member_out(row))
    return result


@router.put("/{user_id}", response_model=ProjectPermissionMemberOut)
def update_project_permission(
    project_id: int,
    user_id: int,
    data: ProjectPermissionPatch,
    _: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    project = db.get(Project, project_id)
    if not project or not project.is_active:
        raise HTTPException(404, "Projeto não encontrado")
    target = db.get(User, user_id)
    if not target or target.level in (UserLevel.admin, UserLevel.ilustrativo):
        raise HTTPException(404, "Usuário não encontrado")
    member = get_membership(db, user_id, project_id)
    if not member:
        raise HTTPException(404, "Usuário não está atribuído a este projeto")

    sectors_in = [s.model_dump() for s in data.sectors]
    member = update_member_project_access(db, target, project, member, sectors_in)
    db.commit()
    db.refresh(member)
    return _member_out(member)
