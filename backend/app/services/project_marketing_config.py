"""Configurações do módulo Marketing por projeto."""

from __future__ import annotations

from copy import deepcopy
from typing import Any

from app.models import Project

DEFAULT_MARKETING_CONFIG: dict[str, Any] = {
    "enabled": False,
    "channels": ["sms", "whatsapp"],
    "expense_types_marketing": ["DIVULGACAO"],
}


def merge_marketing_config(settings: dict | None) -> dict[str, Any]:
    base = deepcopy(DEFAULT_MARKETING_CONFIG)
    raw = (settings or {}).get("marketing_config") or {}
    if "enabled" in raw:
        base["enabled"] = bool(raw["enabled"])
    if isinstance(raw.get("channels"), list):
        base["channels"] = raw["channels"]
    if isinstance(raw.get("expense_types_marketing"), list):
        base["expense_types_marketing"] = raw["expense_types_marketing"]
    return base


def get_marketing_config(project: Project) -> dict[str, Any]:
    return merge_marketing_config(project.settings or {})


def save_marketing_config(project: Project, patch: dict[str, Any]) -> dict[str, Any]:
    from app.services.project_sectors import SECTOR_MARKETING, patch_project_sectors

    settings = dict(project.settings or {})
    current = merge_marketing_config(settings)
    if "enabled" in patch:
        current["enabled"] = bool(patch["enabled"])
        patch_project_sectors(project, {SECTOR_MARKETING: current["enabled"]})
        settings = dict(project.settings or {})
    if "channels" in patch and isinstance(patch["channels"], list):
        current["channels"] = patch["channels"]
    if "expense_types_marketing" in patch and isinstance(patch["expense_types_marketing"], list):
        current["expense_types_marketing"] = patch["expense_types_marketing"]
    settings["marketing_config"] = current
    project.settings = settings
    return current


def is_marketing_enabled(project: Project) -> bool:
    from app.services.project_sectors import is_marketing_enabled as _sector_marketing

    return _sector_marketing(project)
