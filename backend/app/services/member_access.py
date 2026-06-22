"""Acesso por projeto → setor → privilégio (ProjectMember.access_config)."""

from __future__ import annotations

from decimal import Decimal
from typing import Any

from fastapi import HTTPException
from sqlalchemy.orm import Session, joinedload

from app.models import Project, ProjectMember, User, UserLevel
from app.privileges_catalog import PRIVILEGE_CODES, privileges_for_level
from app.services.project_sectors import is_sector_enabled
from app.services.sector_registry import load_sector_registry
from app.services.user_sectors import sync_user_sectors


def privileges_for_sector(sector_id: str) -> list[str]:
    from app.privileges_catalog import privileges_for_sector as _catalog_privileges_for_sector

    return _catalog_privileges_for_sector(sector_id)


def _empty_access() -> dict[str, Any]:
    return {"sectors": {}}


def normalize_access_config(raw: dict | None) -> dict[str, Any]:
    if not raw or not isinstance(raw, dict):
        return _empty_access()
    sectors_raw = raw.get("sectors") or {}
    sectors: dict[str, dict[str, Any]] = {}
    if isinstance(sectors_raw, dict):
        for sid, cfg in sectors_raw.items():
            if not isinstance(cfg, dict):
                continue
            privs = [p for p in (cfg.get("privileges") or []) if p in PRIVILEGE_CODES]
            sectors[str(sid)] = {
                "enabled": bool(cfg.get("enabled")),
                "privileges": privs,
            }
    return {"sectors": sectors}


def default_access_for_project(
    project: Project,
    user_level: UserLevel,
    registry: list[dict],
) -> dict[str, Any]:
    sectors: dict[str, dict[str, Any]] = {}
    level_privs = privileges_for_level(user_level) if user_level != UserLevel.admin else list(PRIVILEGE_CODES)

    for s in registry:
        sid = s["id"]
        if s.get("admin_only") and user_level != UserLevel.admin:
            continue
        if not is_sector_enabled(project, sid, registry):
            continue
        privs = level_privs if sid == "financeiro" else []
        if user_level == UserLevel.admin and sid == "financeiro":
            privs = list(PRIVILEGE_CODES)
        sectors[sid] = {"enabled": True, "privileges": privs}

    if "financeiro" not in sectors and is_sector_enabled(project, "financeiro", registry):
        sectors["financeiro"] = {
            "enabled": True,
            "privileges": level_privs if user_level != UserLevel.admin else list(PRIVILEGE_CODES),
        }

    return {"sectors": sectors}


def default_access_for_project_db(db: Session, project: Project, user_level: UserLevel) -> dict[str, Any]:
    registry = load_sector_registry(db)
    return default_access_for_project(project, user_level, registry)


def access_config_to_sector_list(access: dict | None) -> list[dict[str, Any]]:
    cfg = normalize_access_config(access)
    return [
        {
            "sector_id": sid,
            "enabled": bool(data.get("enabled")),
            "privileges": list(data.get("privileges") or []),
        }
        for sid, data in sorted(cfg["sectors"].items())
    ]


def get_membership(db: Session, user_id: int, project_id: int) -> ProjectMember | None:
    return (
        db.query(ProjectMember)
        .filter(ProjectMember.user_id == user_id, ProjectMember.project_id == project_id)
        .first()
    )


def user_has_project_sector(db: Session, user: User, project_id: int, sector_id: str) -> bool:
    if user.level == UserLevel.admin:
        return True
    member = get_membership(db, user.id, project_id)
    if not member:
        return False
    cfg = normalize_access_config(member.access_config)
    sector = cfg["sectors"].get(sector_id)
    return bool(sector and sector.get("enabled"))


def user_has_project_privilege(
    db: Session,
    user: User,
    project_id: int,
    sector_id: str,
    code: str,
) -> bool:
    if user.level == UserLevel.admin:
        return True
    if code not in PRIVILEGE_CODES:
        return False
    member = get_membership(db, user.id, project_id)
    if not member:
        return False
    cfg = normalize_access_config(member.access_config)
    sector = cfg["sectors"].get(sector_id)
    if not sector or not sector.get("enabled"):
        return False
    return code in (sector.get("privileges") or [])


def derive_privilege_union(db: Session, user_id: int, sector_id: str = "financeiro") -> list[str]:
    rows = db.query(ProjectMember).filter(ProjectMember.user_id == user_id).all()
    codes: set[str] = set()
    for row in rows:
        cfg = normalize_access_config(row.access_config)
        sector = cfg["sectors"].get(sector_id)
        if sector and sector.get("enabled"):
            codes.update(sector.get("privileges") or [])
    return sorted(codes)


def derive_sector_ids_from_memberships(db: Session, user_id: int) -> list[str]:
    rows = db.query(ProjectMember).filter(ProjectMember.user_id == user_id).all()
    enabled: set[str] = set()
    for row in rows:
        cfg = normalize_access_config(row.access_config)
        for sid, data in cfg["sectors"].items():
            if data.get("enabled"):
                enabled.add(sid)
    return sorted(enabled)


def assignment_out_from_member(member: ProjectMember) -> dict[str, Any]:
    project = member.project
    return {
        "id": project.id if project else member.project_id,
        "name": project.name if project else "",
        "commission_percent": float(member.commission_percent or 0),
        "sectors": access_config_to_sector_list(member.access_config),
    }


def _validate_assignment_sectors(
    db: Session,
    user: User,
    project: Project,
    sectors_in: list[dict[str, Any]],
) -> dict[str, Any]:
    registry = load_sector_registry(db)
    valid_ids = {s["id"] for s in registry}
    admin_only_ids = {s["id"] for s in registry if s.get("admin_only")}
    sectors: dict[str, dict[str, Any]] = {}
    for item in sectors_in:
        sid = str(item.get("sector_id") or "")
        if sid not in valid_ids or not is_sector_enabled(project, sid, registry):
            continue
        if sid in admin_only_ids and user.level != UserLevel.admin:
            continue
        privs = [p for p in (item.get("privileges") or []) if p in PRIVILEGE_CODES]
        allowed = set(privileges_for_sector(sid))
        privs = [p for p in privs if p in allowed]
        sectors[sid] = {
            "enabled": bool(item.get("enabled")),
            "privileges": privs,
        }

    if not any(s.get("enabled") for s in sectors.values()):
        default = default_access_for_project(project, user.level, registry)
        sectors = default.get("sectors") or sectors

    return {"sectors": sectors}


def update_member_project_access(
    db: Session,
    user: User,
    project: Project,
    member: ProjectMember,
    sectors_in: list[dict[str, Any]],
) -> ProjectMember:
    from app.services.cash_closing import sync_user_privileges

    access = _validate_assignment_sectors(db, user, project, sectors_in)
    member.access_config = access
    db.flush()
    sector_ids = derive_sector_ids_from_memberships(db, user.id)
    sync_user_sectors(db, user, sector_ids)
    if user.level == UserLevel.admin:
        sync_user_privileges(db, user, [])
    else:
        codes = derive_privilege_union(db, user.id, "financeiro")
        sync_user_privileges(db, user, codes)
    return member


def sync_user_project_assignments(
    db: Session,
    user: User,
    assignments: list[dict[str, Any]] | None,
    *,
    legacy_project_ids: list[int] | None = None,
    legacy_commissions: dict | None = None,
) -> None:
    if assignments is None and legacy_project_ids is None:
        return

    preserved_access: dict[int, dict[str, Any]] = {}
    if legacy_project_ids is not None and assignments is None:
        for row in db.query(ProjectMember).filter(ProjectMember.user_id == user.id).all():
            cfg = normalize_access_config(row.access_config)
            if cfg.get("sectors"):
                preserved_access[row.project_id] = cfg

    db.query(ProjectMember).filter(ProjectMember.user_id == user.id).delete(
        synchronize_session=False
    )

    if user.level == UserLevel.ilustrativo:
        ids = legacy_project_ids or []
        commissions = legacy_commissions or {}
        for pid in ids:
            pct = Decimal(str(commissions.get(str(pid), commissions.get(pid, 0))))
            db.add(
                ProjectMember(
                    project_id=pid,
                    user_id=user.id,
                    commission_percent=pct,
                    access_config=_empty_access(),
                )
            )
        sync_user_sectors(db, user, [])
        return

    if assignments is not None:
        for item in assignments:
            pid = int(item["project_id"])
            project = db.get(Project, pid)
            if not project:
                raise HTTPException(404, f"Projeto {pid} não encontrado")
            pct = Decimal(str(item.get("commission_percent") or 0))
            sectors_in = item.get("sectors") or []
            access = _validate_assignment_sectors(db, user, project, sectors_in)
            db.add(
                ProjectMember(
                    project_id=pid,
                    user_id=user.id,
                    commission_percent=pct,
                    access_config=access,
                )
            )
    elif legacy_project_ids is not None:
        commissions = legacy_commissions or {}
        for pid in legacy_project_ids:
            project = db.get(Project, pid)
            if not project:
                continue
            pct = Decimal(str(commissions.get(str(pid), commissions.get(pid, 0))))
            if pid in preserved_access:
                access = preserved_access[pid]
            else:
                access = default_access_for_project_db(db, project, user.level)
            db.add(
                ProjectMember(
                    project_id=pid,
                    user_id=user.id,
                    commission_percent=pct,
                    access_config=access,
                )
            )

    sector_ids = derive_sector_ids_from_memberships(db, user.id)
    sync_user_sectors(db, user, sector_ids)


def backfill_member_access_config(db: Session) -> None:
    members = (
        db.query(ProjectMember)
        .options(joinedload(ProjectMember.user), joinedload(ProjectMember.project))
        .all()
    )
    for member in members:
        cfg = normalize_access_config(member.access_config)
        if cfg["sectors"]:
            continue
        if not member.project or not member.user:
            continue
        member.access_config = default_access_for_project_db(
            db, member.project, member.user.level
        )
    db.commit()
