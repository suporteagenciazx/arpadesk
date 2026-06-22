"""Registro global de setores (labels, cores, ordem na sidebar)."""

from __future__ import annotations

import re
from copy import deepcopy
from typing import Any

from sqlalchemy.orm import Session

from app.models import AppSetting

REGISTRY_KEY = "sector_registry"

DEFAULT_SECTOR_REGISTRY: list[dict[str, Any]] = [
    {
        "id": "financeiro",
        "label": "Financeiro",
        "color": "#2563eb",
        "always_on": True,
        "sidebar_visible": True,
        "sidebar_order": 0,
        "route": "/financeiro",
    },
    {
        "id": "marketing",
        "label": "Marketing",
        "color": "#db2777",
        "always_on": False,
        "sidebar_visible": True,
        "sidebar_order": 1,
        "route": "/marketing",
    },
    {
        "id": "operacional",
        "label": "Operacional",
        "color": "#059669",
        "always_on": False,
        "sidebar_visible": False,
        "sidebar_order": 2,
        "route": None,
    },
    {
        "id": "logistica",
        "label": "Logística",
        "color": "#d97706",
        "always_on": False,
        "sidebar_visible": False,
        "sidebar_order": 3,
        "route": None,
    },
    {
        "id": "suporte",
        "label": "Suporte",
        "color": "#7c3aed",
        "always_on": False,
        "sidebar_visible": True,
        "sidebar_order": 4,
        "route": "/suporte",
        "admin_only": True,
    },
]


def _valid_hex_color(value: str) -> bool:
    v = (value or "").strip()
    if len(v) != 7 or not v.startswith("#"):
        return False
    try:
        int(v[1:], 16)
        return True
    except ValueError:
        return False


CORE_SECTOR_SIDEBAR: dict[str, dict[str, Any]] = {
    "financeiro": {"route": "/financeiro", "sidebar_visible": True},
    "marketing": {"route": "/marketing", "sidebar_visible": True},
    "suporte": {"route": "/suporte", "sidebar_visible": True},
}

ALWAYS_SIDEBAR_VISIBLE = frozenset({"financeiro", "marketing"})


def _apply_core_sidebar_defaults(items: list[dict[str, Any]]) -> list[dict[str, Any]]:
    for s in items:
        core = CORE_SECTOR_SIDEBAR.get(s["id"])
        if not core:
            continue
        if not s.get("route"):
            s["route"] = core["route"]
        if s["id"] in ALWAYS_SIDEBAR_VISIBLE:
            s["sidebar_visible"] = True
    return items


def slugify_sector_id(label: str) -> str:
    base = re.sub(r"[^a-z0-9]+", "_", (label or "").lower().strip()).strip("_")
    return base[:32] or "setor"


def _normalize_sector(raw: dict, order: int) -> dict[str, Any]:
    sid = (raw.get("id") or slugify_sector_id(raw.get("label") or "")).strip().lower()
    label = (raw.get("label") or sid.replace("_", " ").title()).strip()
    color = str(raw.get("color") or "#64748b").strip().lower()
    if not _valid_hex_color(color):
        color = "#64748b"
    always_on = bool(raw.get("always_on"))
    if sid == "financeiro":
        always_on = True
    route = raw.get("route")
    if route is not None and route != "":
        route = str(route).strip()
        if not route.startswith("/"):
            route = f"/{route}"
    else:
        route = None
    return {
        "id": sid,
        "label": label,
        "color": color,
        "always_on": always_on,
        "admin_only": bool(raw.get("admin_only")),
        "sidebar_visible": bool(raw.get("sidebar_visible", True)),
        "sidebar_order": int(raw.get("sidebar_order", order)),
        "route": route,
    }


def normalize_registry(items: list[dict]) -> list[dict[str, Any]]:
    seen: set[str] = set()
    out: list[dict[str, Any]] = []
    for i, raw in enumerate(items or []):
        item = _normalize_sector(raw, i)
        if item["id"] in seen:
            continue
        seen.add(item["id"])
        out.append(item)
    if not any(s["id"] == "financeiro" for s in out):
        out.insert(0, deepcopy(DEFAULT_SECTOR_REGISTRY[0]))
    out.sort(key=lambda s: (s.get("sidebar_order", 99), s["label"]))
    for i, s in enumerate(out):
        s["sidebar_order"] = i
    return _apply_core_sidebar_defaults(out)


def get_default_registry() -> list[dict[str, Any]]:
    return deepcopy(DEFAULT_SECTOR_REGISTRY)


def load_sector_registry(db: Session) -> list[dict[str, Any]]:
    row = db.get(AppSetting, REGISTRY_KEY)
    if not row or not row.value:
        return get_default_registry()
    raw = row.value.get("sectors") if isinstance(row.value, dict) else row.value
    if not isinstance(raw, list):
        return get_default_registry()
    return normalize_registry(raw)


def save_sector_registry(db: Session, sectors: list[dict]) -> list[dict[str, Any]]:
    normalized = normalize_registry(sectors)
    if not any(s["id"] == "financeiro" for s in normalized):
        raise ValueError("O setor Financeiro é obrigatório")
    row = db.get(AppSetting, REGISTRY_KEY)
    payload = {"sectors": normalized}
    if row:
        row.value = payload
    else:
        db.add(AppSetting(key=REGISTRY_KEY, value=payload))
    db.flush()
    return normalized


def merge_missing_default_sectors(items: list[dict[str, Any]]) -> list[dict[str, Any]]:
    existing = {s["id"] for s in items}
    merged = list(items)
    for default in DEFAULT_SECTOR_REGISTRY:
        if default["id"] not in existing:
            merged.append(deepcopy(default))
    return merged


def seed_sector_registry(db: Session) -> None:
    row = db.get(AppSetting, REGISTRY_KEY)
    if not row:
        save_sector_registry(db, get_default_registry())
        return
    raw = row.value.get("sectors") if isinstance(row.value, dict) else []
    current = normalize_registry(merge_missing_default_sectors(raw if isinstance(raw, list) else []))
    save_sector_registry(db, current)


def registry_ids(registry: list[dict]) -> tuple[str, ...]:
    return tuple(s["id"] for s in registry)


def optional_registry_ids(registry: list[dict]) -> tuple[str, ...]:
    return tuple(s["id"] for s in registry if not s.get("always_on"))


def registry_color_map(registry: list[dict]) -> dict[str, str]:
    return {s["id"]: s.get("color", "#64748b") for s in registry}


def registry_label_map(registry: list[dict]) -> dict[str, str]:
    return {s["id"]: s.get("label", s["id"]) for s in registry}


def sidebar_sectors(registry: list[dict]) -> list[dict[str, Any]]:
    return [s for s in registry if s.get("sidebar_visible") and s.get("route")]
