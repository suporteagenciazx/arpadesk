"""Configurações financeiras do projeto (fechamento flexível, bônus)."""

from __future__ import annotations

import uuid
from copy import deepcopy
from datetime import date, datetime, time, timedelta
from typing import Any

from app.models import Project

WEEKDAYS = {1: "Segunda", 2: "Terça", 3: "Quarta", 4: "Quinta", 5: "Sexta"}

DEFAULT_FINANCE_CONFIG: dict[str, Any] = {
    "active_period": None,
    "closing_schedule": {
        "weekly": {
            "default_weekday": 5,
            "default_time": "20:00",
            "mode": "both",
            "current_week": None,
        },
        "daily": {
            "enabled": False,
            "time": "20:00",
            "mode": "manual",
        },
    },
    "bonus_rules": [],
}

CLOSING_MODES = {"manual", "automatic", "both"}
BONUS_RULE_TYPES = {"sale_milestone", "user_threshold", "general_billing"}
BONUS_PERIODS = {"sale", "day", "week", "month"}
REWARD_TYPES = {"percent", "fixed"}


def _monday_of(d: date) -> date:
    return d - timedelta(days=d.weekday())


def merge_finance_config(settings: dict | None) -> dict[str, Any]:
    base = deepcopy(DEFAULT_FINANCE_CONFIG)
    raw = (settings or {}).get("finance_config") or {}
    weekly = raw.get("closing_schedule", {}).get("weekly", {})
    daily = raw.get("closing_schedule", {}).get("daily", {})
    base["closing_schedule"]["weekly"].update(
        {k: v for k, v in weekly.items() if k in base["closing_schedule"]["weekly"] or k == "current_week"}
    )
    base["closing_schedule"]["daily"].update(
        {k: v for k, v in daily.items() if k in base["closing_schedule"]["daily"]}
    )
    if "active_period" in raw:
        base["active_period"] = raw["active_period"]
    rules = raw.get("bonus_rules")
    if isinstance(rules, list):
        base["bonus_rules"] = rules
    return base


def get_finance_config(project: Project) -> dict[str, Any]:
    return merge_finance_config(project.settings or {})


def save_finance_config(project: Project, patch: dict[str, Any]) -> dict[str, Any]:
    settings = dict(project.settings or {})
    current = merge_finance_config(settings)

    if "closing_schedule" in patch and patch["closing_schedule"]:
        cs = patch["closing_schedule"]
        if "weekly" in cs and cs["weekly"]:
            w = cs["weekly"]
            weekly = current["closing_schedule"]["weekly"]
            for key in ("default_weekday", "default_time", "mode", "current_week"):
                if key in w:
                    weekly[key] = w[key]
            if weekly.get("mode") not in CLOSING_MODES:
                weekly["mode"] = "both"
            wd = weekly.get("default_weekday")
            if wd is not None and wd not in range(1, 6):
                raise ValueError("Dia da semana deve ser entre 1 (segunda) e 5 (sexta)")
        if "daily" in cs and cs["daily"]:
            d = cs["daily"]
            daily = current["closing_schedule"]["daily"]
            for key in ("enabled", "time", "mode"):
                if key in d:
                    daily[key] = d[key]
            if daily.get("mode") not in CLOSING_MODES:
                daily["mode"] = "manual"

    if "bonus_rules" in patch and patch["bonus_rules"] is not None:
        current["bonus_rules"] = [_normalize_bonus_rule(r) for r in patch["bonus_rules"]]

    settings["finance_config"] = current
    project.settings = settings
    return current


def _normalize_bonus_rule(rule: dict) -> dict:
    rid = rule.get("id") or str(uuid.uuid4())
    rule_type = rule.get("rule_type", "user_threshold")
    if rule_type not in BONUS_RULE_TYPES:
        rule_type = "user_threshold"
    period = rule.get("period", "week")
    if period not in BONUS_PERIODS:
        period = "week"
    reward_type = rule.get("reward_type", "fixed")
    if reward_type not in REWARD_TYPES:
        reward_type = "fixed"
    return {
        "id": rid,
        "name": (rule.get("name") or "Regra de bônus").strip(),
        "enabled": bool(rule.get("enabled", True)),
        "rule_type": rule_type,
        "period": period,
        "threshold_amount": float(rule.get("threshold_amount") or 0),
        "reward_type": reward_type,
        "reward_value": float(rule.get("reward_value") or 0),
        "participant_ids": list(rule.get("participant_ids") or []),
        "description": (rule.get("description") or "").strip(),
        "expires_at": rule.get("expires_at") or None,
        "notify_on_automation": bool(rule.get("notify_on_automation", False)),
        "notify_message": (rule.get("notify_message") or "").strip(),
    }


def is_bonus_rule_active(rule: dict, ref: date | None = None) -> bool:
    if not rule.get("enabled", True):
        return False
    exp = rule.get("expires_at")
    if not exp:
        return True
    try:
        return date.fromisoformat(str(exp)) >= (ref or date.today())
    except ValueError:
        return True


def parse_hhmm(value: str) -> time:
    parts = (value or "20:00").strip().split(":")
    h = int(parts[0]) if parts else 20
    m = int(parts[1]) if len(parts) > 1 else 0
    return time(hour=max(0, min(23, h)), minute=max(0, min(59, m)))


def resolve_operational_week(project: Project, ref: date | None = None) -> tuple[date, date]:
    """Retorna início (segunda) e fim operacional da semana de ref."""
    ref = ref or date.today()
    monday = _monday_of(ref)
    config = get_finance_config(project)
    weekly = config["closing_schedule"]["weekly"]
    override = weekly.get("current_week")
    if override and override.get("period_start"):
        try:
            o_start = date.fromisoformat(str(override["period_start"]))
            if o_start == monday and override.get("period_end"):
                return monday, date.fromisoformat(str(override["period_end"]))
        except ValueError:
            pass
    weekday = int(weekly.get("default_weekday") or 5)
    weekday = max(1, min(5, weekday))
    end = monday + timedelta(days=weekday - 1)
    return monday, end


def weekly_closing_time(project: Project) -> str:
    config = get_finance_config(project)
    weekly = config["closing_schedule"]["weekly"]
    override = weekly.get("current_week")
    if override and override.get("closing_time"):
        return str(override["closing_time"])
    return str(weekly.get("default_time") or "20:00")


def is_closing_mode_allowed(project: Project, *, scope: str, mode_needed: str) -> bool:
    config = get_finance_config(project)
    block = config["closing_schedule"]["weekly" if scope == "weekly" else "daily"]
    mode = block.get("mode", "both")
    if mode_needed == "manual":
        return mode in ("manual", "both")
    if mode_needed == "automatic":
        return mode in ("automatic", "both")
    return False


def is_within_manual_closing_window(project: Project, ref: datetime | None = None) -> bool:
    ref = ref or datetime.now()
    today = ref.date()
    start, end = resolve_operational_week(project, today)
    if today < start:
        return False
    closing_t = parse_hhmm(weekly_closing_time(project))
    if today < end:
        return False
    if today > end:
        return True
    return ref.time() >= closing_t


def should_run_automatic_weekly(project: Project, ref: datetime) -> tuple[date, date] | None:
    if not is_closing_mode_allowed(project, scope="weekly", mode_needed="automatic"):
        return None
    start, end = resolve_operational_week(project, ref.date())
    if ref.date() != end:
        return None
    closing_t = parse_hhmm(weekly_closing_time(project))
    if ref.time() < closing_t:
        return None
    return start, end


def should_run_automatic_daily(project: Project, ref: datetime) -> date | None:
    config = get_finance_config(project)
    daily = config["closing_schedule"]["daily"]
    if not daily.get("enabled"):
        return None
    if not is_closing_mode_allowed(project, scope="daily", mode_needed="automatic"):
        return None
    if ref.weekday() >= 5:
        return None
    closing_t = parse_hhmm(str(daily.get("time") or "20:00"))
    if ref.time() < closing_t:
        return None
    return ref.date()
