"""Setores permitidos por usuário (acesso à sidebar e módulos)."""

from __future__ import annotations

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.models import User, UserLevel, UserSector
from app.services.sector_registry import load_sector_registry


def get_user_sector_ids(db: Session, user_id: int) -> list[str]:
    rows = (
        db.query(UserSector.sector_id)
        .filter(UserSector.user_id == user_id)
        .order_by(UserSector.sector_id)
        .all()
    )
    return [r[0] for r in rows]


def default_sector_ids_for_level(level: UserLevel, registry: list[dict]) -> list[str]:
    navigable = [
        s["id"]
        for s in registry
        if s.get("route") and s.get("sidebar_visible", True)
    ]
    if level == UserLevel.admin:
        return navigable
    if level in (UserLevel.financeiro, UserLevel.contador, UserLevel.agente):
        return ["financeiro"] if "financeiro" in navigable else []
    return []


def sync_user_sectors(db: Session, user: User, sector_ids: list[str] | None) -> None:
    if sector_ids is None:
        return
    if user.level == UserLevel.ilustrativo:
        db.query(UserSector).filter(UserSector.user_id == user.id).delete(
            synchronize_session=False
        )
        return

    registry = load_sector_registry(db)
    valid_ids = {s["id"] for s in registry}
    admin_only_ids = {s["id"] for s in registry if s.get("admin_only")}

    filtered: list[str] = []
    for sid in sector_ids:
        if sid not in valid_ids:
            continue
        if sid in admin_only_ids and user.level != UserLevel.admin:
            continue
        if sid not in filtered:
            filtered.append(sid)

    if not filtered:
        filtered = default_sector_ids_for_level(user.level, registry)

    invalid = [s for s in filtered if s not in valid_ids]
    if invalid:
        raise HTTPException(400, f"Setores inválidos: {', '.join(invalid)}")

    db.query(UserSector).filter(UserSector.user_id == user.id).delete(
        synchronize_session=False
    )
    for sid in filtered:
        db.add(UserSector(user_id=user.id, sector_id=sid))
