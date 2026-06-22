"""Setores do projeto — financeiro sempre ativo; demais opcionais."""

from __future__ import annotations

from typing import Any

from app.models import Project
from app.services.sector_registry import (
    get_default_registry,
    optional_registry_ids,
    registry_color_map,
    registry_ids,
    registry_label_map,
)

SECTOR_FINANCEIRO = "financeiro"
SECTOR_MARKETING = "marketing"
SECTOR_OPERACIONAL = "operacional"
SECTOR_LOGISTICA = "logistica"

ALL_SECTOR_IDS = (SECTOR_FINANCEIRO, SECTOR_MARKETING, SECTOR_OPERACIONAL, SECTOR_LOGISTICA)
OPTIONAL_SECTOR_IDS = (SECTOR_MARKETING, SECTOR_OPERACIONAL, SECTOR_LOGISTICA)

SECTOR_LABELS: dict[str, str] = {
    SECTOR_FINANCEIRO: "Financeiro",
    SECTOR_MARKETING: "Marketing",
    SECTOR_OPERACIONAL: "Operacional",
    SECTOR_LOGISTICA: "Logística",
}

DEFAULT_SECTOR_COLORS: dict[str, str] = {
    SECTOR_FINANCEIRO: "#2563eb",
    SECTOR_MARKETING: "#db2777",
    SECTOR_OPERACIONAL: "#059669",
    SECTOR_LOGISTICA: "#d97706",
}


def _registry_or_default(registry: list[dict] | None) -> list[dict]:
    return registry if registry else get_default_registry()


def _legacy_marketing_enabled(settings: dict) -> bool:
    raw = settings.get("marketing_config") or {}
    return bool(raw.get("enabled"))


def merge_sectors(settings: dict | None, registry: list[dict] | None = None) -> dict[str, bool]:
    reg = _registry_or_default(registry)
    raw = dict((settings or {}).get("sectors") or {})
    if not raw and _legacy_marketing_enabled(settings or {}):
        raw[SECTOR_MARKETING] = True
    out: dict[str, bool] = {}
    for s in reg:
        sid = s["id"]
        if s.get("always_on"):
            out[sid] = True
        elif sid in raw:
            out[sid] = bool(raw[sid])
        elif sid == SECTOR_MARKETING and _legacy_marketing_enabled(settings or {}):
            out[sid] = True
        else:
            out[sid] = False
    return out


def get_project_sectors(project: Project, registry: list[dict] | None = None) -> dict[str, bool]:
    return merge_sectors(project.settings or {}, registry)


def is_sector_enabled(project: Project, sector_id: str, registry: list[dict] | None = None) -> bool:
    return bool(merge_sectors(project.settings or {}, registry).get(sector_id))


def is_marketing_enabled(project: Project, registry: list[dict] | None = None) -> bool:
    return is_sector_enabled(project, SECTOR_MARKETING, registry)


def sectors_list_enabled(settings: dict | None, registry: list[dict] | None = None) -> list[str]:
    merged = merge_sectors(settings, registry)
    return [sid for sid, on in merged.items() if on]


def apply_sectors_to_settings(
    settings: dict,
    enabled_sectors: list[str] | None,
    *,
    origin_sector: str | None = None,
    registry: list[dict] | None = None,
) -> dict:
    """Garante financeiro + setores solicitados; sincroniza marketing_config.enabled."""
    reg = _registry_or_default(registry)
    optional_ids = optional_registry_ids(reg)
    out = dict(settings or {})
    merged = merge_sectors(out, reg)
    for sid in optional_ids:
        merged[sid] = sid in (enabled_sectors or [])
    if origin_sector == SECTOR_MARKETING:
        merged[SECTOR_MARKETING] = True
    for s in reg:
        if s.get("always_on"):
            merged[s["id"]] = True
    out["sectors"] = merged

    mc = dict(out.get("marketing_config") or {})
    mc["enabled"] = merged.get(SECTOR_MARKETING, False)
    if merged.get(SECTOR_MARKETING) and not mc.get("channels"):
        mc.setdefault("channels", ["sms", "whatsapp"])
        mc.setdefault("expense_types_marketing", ["DIVULGACAO"])
    out["marketing_config"] = mc
    return out


def build_new_project_settings(
    enabled_sectors: list[str] | None = None,
    *,
    origin_sector: str = SECTOR_FINANCEIRO,
    doc_types: list[str] | None = None,
    expense_types: list[str] | None = None,
    registry: list[dict] | None = None,
) -> dict[str, Any]:
    from app.models import DEFAULT_DOC_TYPES, DEFAULT_EXPENSE_TYPES

    base: dict[str, Any] = {
        "doc_types": doc_types or DEFAULT_DOC_TYPES,
        "expense_types": expense_types or DEFAULT_EXPENSE_TYPES,
    }
    sectors = list(enabled_sectors or [])
    if origin_sector == SECTOR_MARKETING and SECTOR_MARKETING not in sectors:
        sectors.append(SECTOR_MARKETING)
    return apply_sectors_to_settings(base, sectors, origin_sector=origin_sector, registry=registry)


def patch_project_sectors(
    project: Project,
    sector_patch: dict[str, bool],
    registry: list[dict] | None = None,
) -> dict[str, bool]:
    reg = _registry_or_default(registry)
    valid_ids = set(registry_ids(reg))
    settings = dict(project.settings or {})
    merged = merge_sectors(settings, reg)
    for sid, enabled in sector_patch.items():
        if sid not in valid_ids:
            continue
        item = next((s for s in reg if s["id"] == sid), None)
        if item and item.get("always_on"):
            continue
        merged[sid] = bool(enabled)
    for s in reg:
        if s.get("always_on"):
            merged[s["id"]] = True
    enabled_list = [sid for sid in optional_registry_ids(reg) if merged.get(sid)]
    settings = apply_sectors_to_settings(settings, enabled_list, registry=reg)
    project.settings = settings
    return merge_sectors(settings, reg)


def sectors_public(settings: dict | None, registry: list[dict] | None = None) -> list[dict[str, Any]]:
    reg = _registry_or_default(registry)
    merged = merge_sectors(settings, reg)
    colors = registry_color_map(reg)
    labels = registry_label_map(reg)
    return [
        {
            "id": s["id"],
            "label": labels.get(s["id"], s.get("label", s["id"])),
            "enabled": merged.get(s["id"], False),
            "color": colors.get(s["id"], "#64748b"),
        }
        for s in reg
    ]
