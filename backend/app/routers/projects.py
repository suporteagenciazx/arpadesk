from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session, joinedload

from app.database import get_db
from app.dependencies import get_current_user, require_admin, require_admin_finance, user_has_project_access
from app.permissions import FINE_SETTINGS_LEVELS
from app.models import (
    DEFAULT_DOC_TYPES,
    DEFAULT_EXPENSE_TYPES,
    Project,
    ProjectMember,
    ProjectPaymentSettings,
    User,
    UserLevel,
)
from app.schemas import (
    ActivePeriodOut,
    FinanceSummary,
    PaymentSettingsIn,
    PaymentSettingsOut,
    ProjectCreate,
    ProjectDeleteRequest,
    ProjectFinanceConfigOut,
    ProjectFinanceConfigPatch,
    ProjectMemberIn,
    ProjectMemberOut,
    ProjectOut,
    ProjectSettingsPatch,
    ProjectUpdate,
)
from app.services.finance import compute_summary, compute_report, slugify
from app.services.cache import cached_json, cache_delete_prefix
from app.services.project_finance_config import get_finance_config, save_finance_config
from app.services.project_sectors import build_new_project_settings, sectors_public
from app.services.sector_registry import load_sector_registry
from app.services.active_period import active_period_to_dict
from app.auth_utils import verify_password

router = APIRouter(prefix="/api/projects", tags=["projects"])


def _project_out(p: Project) -> ProjectOut:
    return ProjectOut(
        id=p.id,
        name=p.name,
        slug=p.slug,
        description=p.description,
        settings=p.settings or {},
        is_active=p.is_active,
    )


@router.get("", response_model=list[ProjectOut])
def list_projects(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    if user.level == UserLevel.admin:
        projects = db.query(Project).filter(Project.is_active == True).order_by(Project.name).all()
    else:
        projects = (
            db.query(Project)
            .join(ProjectMember)
            .filter(ProjectMember.user_id == user.id, Project.is_active == True)
            .order_by(Project.name)
            .all()
        )
    return [_project_out(p) for p in projects]


@router.post("", response_model=ProjectOut, status_code=201)
def create_project(data: ProjectCreate, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    from app.permissions import can_create_project

    if not can_create_project(db, user):
        raise HTTPException(403, "Sem privilégio para criar projetos")
    slug = slugify(data.name)
    if db.query(Project).filter(Project.slug == slug).first():
        raise HTTPException(400, "Projeto já existe")
    registry = load_sector_registry(db)
    project = Project(
        name=data.name.upper(),
        slug=slug,
        description=data.description,
        settings=build_new_project_settings(
            data.sectors,
            origin_sector=data.origin_sector or "financeiro",
            registry=registry,
        ),
    )
    db.add(project)
    db.flush()
    if user.level != UserLevel.admin:
        db.add(ProjectMember(project_id=project.id, user_id=user.id, commission_percent=Decimal("0")))
    db.commit()
    db.refresh(project)
    return _project_out(project)


@router.patch("/{project_id}", response_model=ProjectOut)
def update_project(
    project_id: int,
    data: ProjectUpdate,
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    project = db.get(Project, project_id)
    if not project or not project.is_active:
        raise HTTPException(404, "Projeto não encontrado")
    name = data.name.strip().upper()
    if not name:
        raise HTTPException(400, "Nome inválido")
    slug = slugify(name)
    conflict = db.query(Project).filter(Project.slug == slug, Project.id != project_id).first()
    if conflict:
        raise HTTPException(400, "Já existe um projeto com esse nome")
    project.name = name
    project.slug = slug
    db.commit()
    db.refresh(project)
    return _project_out(project)


@router.post("/{project_id}/delete", status_code=204)
def delete_project(
    project_id: int,
    data: ProjectDeleteRequest,
    user: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    admins = db.query(User).filter(User.level == UserLevel.admin, User.is_active.is_(True)).all()
    verified = any(
        a.password_hash and verify_password(data.admin_password, a.password_hash) for a in admins
    )
    if not verified:
        raise HTTPException(403, "Senha de administrador incorreta")
    project = db.get(Project, project_id)
    if not project:
        raise HTTPException(404, "Projeto não encontrado")
    cache_delete_prefix(f"summary:{project_id}:")
    cache_delete_prefix(f"report:{project_id}:")
    cache_delete_prefix(f"commissions:{project_id}:")
    db.delete(project)
    db.commit()


@router.get("/{project_id}", response_model=ProjectOut)
def get_project(project_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    if not user_has_project_access(db, user, project_id):
        raise HTTPException(403, "Sem acesso ao projeto")
    project = db.get(Project, project_id)
    if not project:
        raise HTTPException(404, "Projeto não encontrado")
    return _project_out(project)


@router.patch("/{project_id}/settings", response_model=ProjectOut)
def patch_project_settings(
    project_id: int,
    data: ProjectSettingsPatch,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if user.level not in (UserLevel.admin, UserLevel.financeiro):
        raise HTTPException(403, "Sem permissão")
    if not user_has_project_access(db, user, project_id):
        raise HTTPException(403, "Sem acesso ao projeto")
    project = db.get(Project, project_id)
    if not project:
        raise HTTPException(404, "Projeto não encontrado")
    settings = dict(project.settings or {})
    if data.telegram_notify_on_ok is not None:
        settings["telegram_notify_on_ok"] = data.telegram_notify_on_ok
    project.settings = settings
    db.commit()
    db.refresh(project)
    return _project_out(project)


@router.get("/{project_id}/active-period", response_model=ActivePeriodOut)
def get_active_period(
    project_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if not user_has_project_access(db, user, project_id):
        raise HTTPException(403, "Sem acesso ao projeto")
    project = db.get(Project, project_id)
    if not project:
        raise HTTPException(404, "Projeto não encontrado")
    return ActivePeriodOut(**active_period_to_dict(db, project))


@router.get("/{project_id}/finance-config", response_model=ProjectFinanceConfigOut)
def get_finance_config_endpoint(
    project_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if user.level not in (UserLevel.admin, UserLevel.financeiro):
        raise HTTPException(403, "Sem permissão")
    if not user_has_project_access(db, user, project_id):
        raise HTTPException(403, "Sem acesso ao projeto")
    project = db.get(Project, project_id)
    if not project:
        raise HTTPException(404, "Projeto não encontrado")
    config = get_finance_config(project)
    members = (
        db.query(ProjectMember)
        .options(joinedload(ProjectMember.user))
        .filter(ProjectMember.project_id == project_id)
        .all()
    )
    return ProjectFinanceConfigOut(
        closing_schedule=config["closing_schedule"],
        bonus_rules=config["bonus_rules"],
        members=[
            ProjectMemberOut(
                id=m.id,
                user_id=m.user_id,
                user_name=m.user.name,
                user_level=m.user.level,
                commission_percent=float(m.commission_percent or 0),
            )
            for m in members
        ],
    )


@router.patch("/{project_id}/finance-config", response_model=ProjectFinanceConfigOut)
def patch_finance_config(
    project_id: int,
    data: ProjectFinanceConfigPatch,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if user.level not in (UserLevel.admin, UserLevel.financeiro):
        raise HTTPException(403, "Sem permissão")
    if not user_has_project_access(db, user, project_id):
        raise HTTPException(403, "Sem acesso ao projeto")
    project = db.get(Project, project_id)
    if not project:
        raise HTTPException(404, "Projeto não encontrado")
    patch = data.model_dump(exclude_unset=True)
    if data.closing_schedule:
        patch["closing_schedule"] = data.closing_schedule.model_dump(exclude_unset=True)
    if data.bonus_rules is not None:
        patch["bonus_rules"] = [r.model_dump() for r in data.bonus_rules]
    try:
        save_finance_config(project, patch)
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc
    db.commit()
    db.refresh(project)
    return get_finance_config_endpoint(project_id, user, db)


@router.get("/{project_id}/members", response_model=list[ProjectMemberOut])
def list_members(project_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    if not user_has_project_access(db, user, project_id):
        raise HTTPException(403, "Sem acesso")
    rows = (
        db.query(ProjectMember)
        .options(joinedload(ProjectMember.user))
        .filter(ProjectMember.project_id == project_id)
        .all()
    )
    return [
        ProjectMemberOut(
            id=r.id,
            user_id=r.user_id,
            user_name=r.user.name,
            user_level=r.user.level,
            commission_percent=float(r.commission_percent or 0),
        )
        for r in rows
    ]


@router.post("/{project_id}/members", response_model=ProjectMemberOut, status_code=201)
def add_member(
    project_id: int,
    data: ProjectMemberIn,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if user.level not in (UserLevel.admin, UserLevel.financeiro):
        raise HTTPException(403, "Sem permissão")
    if not user_has_project_access(db, user, project_id):
        raise HTTPException(403, "Sem acesso")
    u = db.get(User, data.user_id)
    if not u:
        raise HTTPException(404, "Usuário não encontrado")
    existing = (
        db.query(ProjectMember)
        .filter(ProjectMember.project_id == project_id, ProjectMember.user_id == data.user_id)
        .first()
    )
    if existing:
        existing.commission_percent = Decimal(str(data.commission_percent))
        db.commit()
        db.refresh(existing)
        m = existing
    else:
        m = ProjectMember(
            project_id=project_id,
            user_id=data.user_id,
            commission_percent=Decimal(str(data.commission_percent)),
        )
        db.add(m)
        db.commit()
        db.refresh(m)
    return ProjectMemberOut(
        id=m.id,
        user_id=u.id,
        user_name=u.name,
        user_level=u.level,
        commission_percent=float(m.commission_percent or 0),
    )


@router.delete("/{project_id}/members/{member_id}", status_code=204)
def remove_member(
    project_id: int,
    member_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if user.level not in (UserLevel.admin, UserLevel.financeiro):
        raise HTTPException(403, "Sem permissão")
    m = db.get(ProjectMember, member_id)
    if not m or m.project_id != project_id:
        raise HTTPException(404, "Membro não encontrado")
    db.delete(m)
    db.commit()


@router.get("/{project_id}/payment-settings", response_model=PaymentSettingsOut | None)
def get_payment_settings(project_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    if not user_has_project_access(db, user, project_id):
        raise HTTPException(403, "Sem acesso")
    ps = db.query(ProjectPaymentSettings).filter(ProjectPaymentSettings.project_id == project_id).first()
    return ps


@router.put("/{project_id}/payment-settings", response_model=PaymentSettingsOut)
def upsert_payment_settings(
    project_id: int,
    data: PaymentSettingsIn,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if user.level not in FINE_SETTINGS_LEVELS:
        raise HTTPException(403, "Sem permissão")
    if not user_has_project_access(db, user, project_id):
        raise HTTPException(403, "Sem acesso")
    ps = db.query(ProjectPaymentSettings).filter(ProjectPaymentSettings.project_id == project_id).first()
    if not ps:
        ps = ProjectPaymentSettings(project_id=project_id)
        db.add(ps)
    for k, v in data.model_dump().items():
        setattr(ps, k, v)
    db.commit()
    db.refresh(ps)
    return ps


@router.get("/{project_id}/summary", response_model=FinanceSummary)
def project_summary(
    project_id: int,
    period_start: str | None = Query(None),
    period_end: str | None = Query(None),
    user: User = Depends(require_admin_finance),
    db: Session = Depends(get_db),
):
    if not user_has_project_access(db, user, project_id):
        raise HTTPException(403, "Sem acesso")
    from datetime import date as dt

    ps = dt.fromisoformat(period_start) if period_start else None
    pe = dt.fromisoformat(period_end) if period_end else None
    key = f"summary:{project_id}:{ps}:{pe}"
    return cached_json(key, lambda: compute_summary(db, project_id, ps, pe))


@router.get("/{project_id}/report")
def project_report(
    project_id: int,
    period_start: str | None = Query(None),
    period_end: str | None = Query(None),
    user: User = Depends(require_admin_finance),
    db: Session = Depends(get_db),
):
    if not user_has_project_access(db, user, project_id):
        raise HTTPException(403, "Sem acesso")
    from datetime import date as dt

    ps = dt.fromisoformat(period_start) if period_start else None
    pe = dt.fromisoformat(period_end) if period_end else None
    if not ps or not pe:
        today = dt.today()
        ps = today.replace(day=1)
        pe = today
    key = f"report:{project_id}:{ps}:{pe}"

    def _build():
        return compute_report(db, project_id, ps, pe)

    return cached_json(key, _build)
