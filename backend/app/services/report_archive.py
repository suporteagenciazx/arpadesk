"""Arquivo de relatórios semanais salvos no projeto."""

from __future__ import annotations

from datetime import date, datetime, timezone

from fastapi import HTTPException
from sqlalchemy.orm import Session, joinedload

from app.models import CashClosing, Project, ReportImport, ReportImportLog, Sale, User, UserLevel
from app.services.calendar import report_week_description
from app.services.cash_closing import (
    ensure_cash_closing_from_import,
    generate_report_public_id,
    get_cash_closing,
)
from app.services.finance import compute_summary


def backfill_retroactive_report_public_ids(db: Session, project_id: int | None = None) -> int:
    """TEMPORÁRIO: atribui IDs de 5 dígitos a relatórios importados/salvos sem public_id."""
    query = db.query(CashClosing).filter(CashClosing.report_public_id.is_(None))
    if project_id is not None:
        query = query.filter(CashClosing.project_id == project_id)
    closings = query.all()
    updated = 0
    for closing in closings:
        has_activity = (
            db.query(ReportImportLog.id)
            .filter(
                ReportImportLog.project_id == closing.project_id,
                ReportImportLog.period_start == closing.period_start,
                ReportImportLog.period_end == closing.period_end,
            )
            .first()
        )
        if not has_activity:
            continue
        closing.report_public_id = generate_report_public_id(db, closing.project_id)
        updated += 1

    log_query = db.query(ReportImportLog)
    if project_id is not None:
        log_query = log_query.filter(ReportImportLog.project_id == project_id)
    seen: set[tuple[int, date, date]] = set()
    for log in log_query.all():
        key = (log.project_id, log.period_start, log.period_end)
        if key in seen:
            continue
        seen.add(key)
        closing = get_cash_closing(db, log.project_id, log.period_start, log.period_end)
        if not closing:
            actor = log.created_by
            if not actor:
                actor = db.query(User).filter(User.level == UserLevel.admin, User.is_active.is_(True)).first()
            if actor:
                closing = ensure_cash_closing_from_import(
                    db, log.project_id, log.period_start, log.period_end, actor
                )
        if closing and not closing.report_public_id:
            closing.report_public_id = generate_report_public_id(db, log.project_id)
            updated += 1
    if updated:
        db.commit()
    return updated


def reopen_saved_report_for_edit(
    db: Session,
    project_id: int,
    period_start: date,
    period_end: date,
    user: User,
) -> CashClosing:
    closing = get_cash_closing(db, project_id, period_start, period_end)
    if not closing:
        has_log = (
            db.query(ReportImportLog.id)
            .filter(
                ReportImportLog.project_id == project_id,
                ReportImportLog.period_start == period_start,
                ReportImportLog.period_end == period_end,
            )
            .first()
        )
        if not has_log:
            raise HTTPException(404, "Relatório não encontrado para este período")
        closing = ensure_cash_closing_from_import(db, project_id, period_start, period_end, user)
        if not closing.report_public_id:
            closing.report_public_id = generate_report_public_id(db, project_id)

    now = datetime.now(timezone.utc)
    closing.reopened_at = now
    closing.reopened_by_id = user.id
    closing.reopen_scope = "admin_only"
    closing.report_tabs_locked = False
    db.commit()
    return (
        db.query(CashClosing)
        .filter(CashClosing.id == closing.id)
        .first()
    )


def cancel_report_edit(
    db: Session,
    project_id: int,
    period_start: date,
    period_end: date,
) -> CashClosing:
    closing = get_cash_closing(db, project_id, period_start, period_end)
    if not closing:
        raise HTTPException(404, "Relatório não encontrado para este período")
    if not closing.reopened_at:
        raise HTTPException(400, "Relatório não está em edição")

    closing.reopened_at = None
    closing.reopened_by_id = None
    closing.reopen_scope = None
    closing.report_tabs_locked = True
    db.commit()
    return (
        db.query(CashClosing)
        .filter(CashClosing.id == closing.id)
        .first()
    )


def _metrics_for_period(
    db: Session, project_id: int, period_start, period_end, snapshot: dict | None
) -> dict:
    if snapshot and snapshot.get("billing_total") is not None:
        billing = float(snapshot["billing_total"])
        sales_count = int(snapshot.get("sales_count") or 0)
    else:
        period_sales = (
            db.query(Sale)
            .filter(
                Sale.project_id == project_id,
                Sale.sale_date >= period_start,
                Sale.sale_date <= period_end,
            )
            .all()
        )
        sales_count = len(period_sales)
        billing = round(sum(float(s.amount) for s in period_sales), 2)

    summary = compute_summary(db, project_id, period_start, period_end)
    expenses = round(abs(float(summary["total_expenses"])), 2)
    profit = round(float(summary["balance"]), 2)

    return {
        "billing_total": round(billing, 2),
        "expenses_total": expenses,
        "sales_count": sales_count,
        "profit": profit,
    }


def _public_id_for_period(db: Session, project_id: int, period_start, period_end) -> str:
    closing = get_cash_closing(db, project_id, period_start, period_end)
    has_log = (
        db.query(ReportImportLog.id)
        .filter(
            ReportImportLog.project_id == project_id,
            ReportImportLog.period_start == period_start,
            ReportImportLog.period_end == period_end,
        )
        .first()
    )
    if not closing and has_log:
        log = (
            db.query(ReportImportLog)
            .options(joinedload(ReportImportLog.created_by))
            .filter(
                ReportImportLog.project_id == project_id,
                ReportImportLog.period_start == period_start,
                ReportImportLog.period_end == period_end,
            )
            .first()
        )
        actor = log.created_by if log else None
        if not actor:
            actor = db.query(User).filter(User.level == UserLevel.admin, User.is_active.is_(True)).first()
        if actor:
            closing = ensure_cash_closing_from_import(db, project_id, period_start, period_end, actor)
    if not closing:
        return ""
    if closing.report_public_id:
        return closing.report_public_id
    if has_log:
        closing.report_public_id = generate_report_public_id(db, project_id)
        db.commit()
        return closing.report_public_id
    return ""


def restore_report_as_active_period(
    db: Session,
    project_id: int,
    period_start: date,
    period_end: date,
) -> dict:
    """Recua o ponteiro da semana aberta para um relatório já salvo (correção de salvamento acidental)."""
    closing = get_cash_closing(db, project_id, period_start, period_end)
    if not closing:
        raise HTTPException(404, "Relatório não encontrado para este período")
    if not closing.report_tabs_locked:
        raise HTTPException(400, "Apenas relatórios já salvos podem ser restaurados como vigentes")

    project = db.get(Project, project_id)
    if not project:
        raise HTTPException(404, "Projeto não encontrado")

    from app.services.active_period import active_period_to_dict, sync_active_period_to

    sync_active_period_to(db, project, period_start, period_end)
    return active_period_to_dict(db, project)


def list_report_archive(db: Session, project_id: int) -> list[dict]:
    from app.services.active_period import resolve_active_period

    backfill_retroactive_report_public_ids(db, project_id)
    project = db.get(Project, project_id)
    active_start, active_end = resolve_active_period(db, project) if project else (None, None)

    def _row(**kwargs) -> dict:
        ps = kwargs["period_start"]
        pe = kwargs["period_end"]
        kwargs["is_active_period"] = (
            active_start is not None
            and active_end is not None
            and ps == active_start.isoformat()
            and pe == active_end.isoformat()
        )
        return kwargs

    logs = (
        db.query(ReportImportLog)
        .options(joinedload(ReportImportLog.created_by))
        .filter(ReportImportLog.project_id == project_id)
        .order_by(ReportImportLog.period_start.desc(), ReportImportLog.saved_at.desc())
        .all()
    )

    seen_periods: set[tuple] = set()
    rows: list[dict] = []

    for log in logs:
        key = (log.period_start, log.period_end)
        if key in seen_periods:
            continue
        seen_periods.add(key)

        closing: CashClosing | None = get_cash_closing(db, project_id, log.period_start, log.period_end)
        snapshot = (closing.summary_snapshot or {}) if closing else {}
        metrics = _metrics_for_period(db, project_id, log.period_start, log.period_end, snapshot)
        report_import = (
            db.query(ReportImport)
            .filter(
                ReportImport.project_id == project_id,
                ReportImport.period_start == log.period_start,
                ReportImport.period_end == log.period_end,
            )
            .first()
        )
        public_id = _public_id_for_period(db, project_id, log.period_start, log.period_end)

        rows.append(
            _row(
                id=public_id,
                period_start=log.period_start.isoformat(),
                period_end=log.period_end.isoformat(),
                description=report_week_description(log.period_start, log.period_end),
                billing_total=metrics["billing_total"],
                expenses_total=metrics["expenses_total"],
                sales_count=metrics["sales_count"],
                profit=metrics["profit"],
                saved_at=log.saved_at.isoformat() if log.saved_at else None,
                has_pdf=bool(report_import and report_import.pdf_object_key),
            )
        )

    closings = (
        db.query(CashClosing)
        .filter(CashClosing.project_id == project_id)
        .order_by(CashClosing.period_start.desc())
        .all()
    )
    for closing in closings:
        key = (closing.period_start, closing.period_end)
        if key in seen_periods:
            continue
        if not closing.report_public_id:
            continue
        seen_periods.add(key)
        snapshot = closing.summary_snapshot or {}
        metrics = _metrics_for_period(db, project_id, closing.period_start, closing.period_end, snapshot)
        report_import = (
            db.query(ReportImport)
            .filter(
                ReportImport.project_id == project_id,
                ReportImport.period_start == closing.period_start,
                ReportImport.period_end == closing.period_end,
            )
            .first()
        )
        rows.append(
            _row(
                id=closing.report_public_id,
                period_start=closing.period_start.isoformat(),
                period_end=closing.period_end.isoformat(),
                description=report_week_description(closing.period_start, closing.period_end),
                billing_total=metrics["billing_total"],
                expenses_total=metrics["expenses_total"],
                sales_count=metrics["sales_count"],
                profit=metrics["profit"],
                saved_at=closing.confirmed_at.isoformat() if closing.confirmed_at else None,
                has_pdf=bool(report_import and report_import.pdf_object_key),
            )
        )

    rows.sort(key=lambda r: (r["period_start"], r.get("saved_at") or ""), reverse=True)
    return rows
