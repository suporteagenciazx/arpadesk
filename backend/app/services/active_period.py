"""Semana operacional aberta do projeto — fonte da verdade para equipe não-admin."""

from __future__ import annotations

from datetime import date, timedelta

from sqlalchemy.orm import Session

from app.models import CashClosing, Project
from app.services.project_finance_config import get_finance_config, merge_finance_config, resolve_operational_week


def next_operational_week(period_start: date, period_end: date) -> tuple[date, date]:
    return period_start + timedelta(days=7), period_end + timedelta(days=7)


def get_stored_active_period(project: Project) -> tuple[date, date] | None:
    config = get_finance_config(project)
    raw = config.get("active_period") or {}
    start_s = raw.get("period_start")
    end_s = raw.get("period_end")
    if not start_s or not end_s:
        return None
    try:
        return date.fromisoformat(str(start_s)), date.fromisoformat(str(end_s))
    except ValueError:
        return None


def persist_active_period(db: Session, project: Project, period_start: date, period_end: date) -> None:
    settings = dict(project.settings or {})
    config = merge_finance_config(settings)
    config["active_period"] = {
        "period_start": period_start.isoformat(),
        "period_end": period_end.isoformat(),
    }
    settings["finance_config"] = config
    project.settings = settings
    db.commit()


def _last_saved_report(db: Session, project_id: int) -> CashClosing | None:
    return (
        db.query(CashClosing)
        .filter(
            CashClosing.project_id == project_id,
            CashClosing.report_tabs_locked.is_(True),
        )
        .order_by(CashClosing.period_end.desc())
        .first()
    )


def infer_active_period(db: Session, project: Project) -> tuple[date, date]:
    """Último relatório salvo → próxima semana; senão semana operacional de hoje."""
    last_saved = _last_saved_report(db, project.id)
    if last_saved:
        return next_operational_week(last_saved.period_start, last_saved.period_end)
    return resolve_operational_week(project)


def reconcile_active_period(db: Session, project: Project) -> tuple[date, date]:
    """Corrige semana aberta quando relatório já foi salvo mas o ponteiro ficou desatualizado."""
    last_saved = _last_saved_report(db, project.id)
    stored = get_stored_active_period(project)
    if last_saved:
        expected = next_operational_week(last_saved.period_start, last_saved.period_end)
        if not stored or stored[0] <= last_saved.period_start:
            persist_active_period(db, project, expected[0], expected[1])
            return expected
    if stored:
        return stored
    start, end = infer_active_period(db, project)
    persist_active_period(db, project, start, end)
    return start, end


def resolve_active_period(db: Session, project: Project) -> tuple[date, date]:
    return reconcile_active_period(db, project)


def active_period_to_dict(db: Session, project: Project) -> dict:
    start, end = resolve_active_period(db, project)
    today = date.today()
    week_open = today >= start
    return {
        "period_start": start.isoformat(),
        "period_end": end.isoformat(),
        "week_open_for_team": week_open,
        "next_opening_date": start.isoformat() if not week_open else None,
    }


def sync_active_period_to(
    db: Session, project: Project, period_start: date, period_end: date
) -> tuple[date, date]:
    persist_active_period(db, project, period_start, period_end)
    return period_start, period_end


def advance_active_period_after_report_save(
    db: Session, project: Project, saved_start: date, saved_end: date
) -> tuple[date, date]:
    next_start, next_end = next_operational_week(saved_start, saved_end)
    persist_active_period(db, project, next_start, next_end)
    return next_start, next_end
