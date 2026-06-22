"""Fechamento de caixa — snapshot, bloqueio de período e privilégios."""

from __future__ import annotations

from datetime import date, datetime, timezone

from fastapi import HTTPException
from sqlalchemy.orm import Session, joinedload

from app.models import (
    CashClosing,
    CashClosingStatus,
    PeriodFine,
    Project,
    ProjectMember,
    Sale,
    SaleStatus,
    User,
    UserLevel,
    UserPrivilege,
)
from app.privileges_catalog import PRIVILEGE_CASH_CLOSING, PRIVILEGE_CODES, PRIVILEGE_FULL_HISTORY
from app.services.finance import compute_summary


def get_user_privilege_codes(db: Session, user_id: int) -> list[str]:
    rows = db.query(UserPrivilege.code).filter(UserPrivilege.user_id == user_id).all()
    return [r[0] for r in rows]


def sync_user_privileges(db: Session, user: User, codes: list[str] | None) -> None:
    if codes is None:
        return
    if user.level == UserLevel.ilustrativo:
        db.query(UserPrivilege).filter(UserPrivilege.user_id == user.id).delete(
            synchronize_session=False
        )
        return
    invalid = [c for c in codes if c not in PRIVILEGE_CODES]
    if invalid:
        raise HTTPException(400, f"Privilégios inválidos: {', '.join(invalid)}")
    db.query(UserPrivilege).filter(UserPrivilege.user_id == user.id).delete(
        synchronize_session=False
    )
    for code in codes:
        db.add(UserPrivilege(user_id=user.id, code=code))


def user_has_privilege(
    db: Session,
    user: User,
    code: str,
    *,
    project_id: int | None = None,
    sector_id: str = "financeiro",
) -> bool:
    if user.level == UserLevel.admin:
        return True
    if user.level == UserLevel.ilustrativo:
        return False
    if project_id is not None:
        from app.services.member_access import user_has_project_privilege

        return user_has_project_privilege(db, user, project_id, sector_id, code)
    return (
        db.query(UserPrivilege)
        .filter(UserPrivilege.user_id == user.id, UserPrivilege.code == code)
        .first()
        is not None
    )


def get_cash_closing(
    db: Session, project_id: int, period_start: date, period_end: date
) -> CashClosing | None:
    return (
        db.query(CashClosing)
        .options(
            joinedload(CashClosing.closed_by),
            joinedload(CashClosing.confirmed_by),
            joinedload(CashClosing.reopened_by),
        )
        .filter(
            CashClosing.project_id == project_id,
            CashClosing.period_start == period_start,
            CashClosing.period_end == period_end,
        )
        .first()
    )


def user_can_access_period(
    db: Session,
    project_id: int,
    user: User,
    period_start: date | None,
    period_end: date | None,
) -> bool:
    if user.level == UserLevel.admin:
        return True
    if user_has_privilege(db, user, PRIVILEGE_FULL_HISTORY, project_id=project_id):
        return True
    if not period_start or not period_end:
        return False
    project = db.get(Project, project_id)
    if not project:
        return False
    from app.services.active_period import resolve_active_period

    active_start, active_end = resolve_active_period(db, project)
    return period_start == active_start and period_end == active_end


def assert_period_accessible_for_user(
    db: Session,
    project_id: int,
    user: User,
    period_start: date | None,
    period_end: date | None,
) -> None:
    if not user_can_access_period(db, project_id, user, period_start, period_end):
        raise HTTPException(
            403,
            "Sem privilégio de histórico completo — apenas a semana aberta do projeto está disponível.",
        )


def guard_period_access(
    db: Session,
    project_id: int,
    user: User,
    period_start: str | None,
    period_end: str | None,
) -> None:
    if not period_start or not period_end:
        return
    assert_period_accessible_for_user(
        db, project_id, user, date.fromisoformat(period_start), date.fromisoformat(period_end)
    )


def is_report_tabs_locked(closing: CashClosing | None) -> bool:
    if not closing:
        return False
    return bool(closing.report_tabs_locked and not closing.reopened_at)


def generate_report_public_id(db: Session, project_id: int) -> str:
    import random
    import string

    for _ in range(100):
        code = "".join(random.choices(string.digits, k=5))
        exists = (
            db.query(CashClosing.id)
            .filter(
                CashClosing.project_id == project_id,
                CashClosing.report_public_id == code,
            )
            .first()
        )
        if not exists:
            return code
    raise HTTPException(500, "Não foi possível gerar o ID do relatório")


def is_period_frozen_for_user(
    db: Session, project_id: int, period_start: date | None, period_end: date | None, user: User
) -> bool:
    if user.level == UserLevel.admin:
        return False
    if not period_start or not period_end:
        return False
    project = db.get(Project, project_id)
    if project:
        from app.services.active_period import resolve_active_period

        active_start, active_end = resolve_active_period(db, project)
        if period_start == active_start and period_end == active_end:
            if date.today() < active_start:
                return True
    closing = get_cash_closing(db, project_id, period_start, period_end)
    if not closing:
        return False
    if closing.reopened_at:
        if closing.reopen_scope == "all":
            return False
        return True
    return True


def assert_period_writable(
    db: Session, project_id: int, period_start: date | None, period_end: date | None, user: User
) -> None:
    assert_period_accessible_for_user(db, project_id, user, period_start, period_end)
    if is_period_frozen_for_user(db, project_id, period_start, period_end, user):
        raise HTTPException(
            403,
            "Período com fechamento de caixa — apenas o administrador pode alterar dados.",
        )


def assert_sales_expenses_writable(
    db: Session, project_id: int, period_start: date | None, period_end: date | None, user: User
) -> None:
    assert_period_accessible_for_user(db, project_id, user, period_start, period_end)
    if is_period_frozen_for_user(db, project_id, period_start, period_end, user):
        project = db.get(Project, project_id)
        if project and period_start and period_end:
            from app.services.active_period import resolve_active_period

            active_start, active_end = resolve_active_period(db, project)
            if (
                period_start == active_start
                and period_end == active_end
                and date.today() < active_start
            ):
                raise HTTPException(
                    403,
                    "Semana ainda não abriu para operação — aguarde a data programada.",
                )
        raise HTTPException(
            403,
            "Período com fechamento de caixa — apenas o administrador pode alterar dados.",
        )
    closing = get_cash_closing(db, project_id, period_start, period_end)
    if is_report_tabs_locked(closing):
        raise HTTPException(
            403,
            "Relatório salvo — reabra o caixa para alterar vendas ou despesas.",
        )


def build_cash_closing_snapshot(
    db: Session, project_id: int, period_start: date, period_end: date
) -> dict:
    sales = (
        db.query(Sale)
        .options(joinedload(Sale.participant))
        .filter(
            Sale.project_id == project_id,
            Sale.sale_date >= period_start,
            Sale.sale_date <= period_end,
        )
        .order_by(Sale.created_at.desc())
        .all()
    )
    ok_sales = [s for s in sales if s.status == SaleStatus.ok]
    billing_total = sum(float(s.amount) for s in sales)
    ok_total = sum(float(s.amount) for s in ok_sales)

    fines = (
        db.query(PeriodFine)
        .options(joinedload(PeriodFine.participant))
        .filter(
            PeriodFine.project_id == project_id,
            PeriodFine.period_start == period_start,
            PeriodFine.period_end == period_end,
        )
        .all()
    )
    fines_total = sum(float(f.amount) for f in fines)

    members = (
        db.query(ProjectMember, User)
        .join(User, ProjectMember.user_id == User.id)
        .filter(ProjectMember.project_id == project_id)
        .all()
    )
    member_rows = [
        {
            "user_id": u.id,
            "user_name": u.name,
            "user_level": u.level.value,
            "commission_percent": float(m.commission_percent or 0),
        }
        for m, u in members
    ]

    by_participant: dict[int, float] = {}
    for s in ok_sales:
        by_participant[s.participant_id] = by_participant.get(s.participant_id, 0) + float(s.amount)

    fines_by_user = {f.participant_id: float(f.amount) for f in fines}
    commission_rows = []
    for m in member_rows:
        if m["user_level"] != "ilustrativo":
            continue
        billing = by_participant.get(m["user_id"], 0)
        pct = m["commission_percent"]
        commission = round(billing * pct / 100, 2)
        fine = fines_by_user.get(m["user_id"], 0)
        commission_rows.append(
            {
                "name": m["user_name"],
                "billing": round(billing, 2),
                "percent": pct,
                "commission": commission,
                "fine": fine,
                "net": round(commission - fine, 2),
            }
        )
    commission_rows.sort(key=lambda x: x["name"])

    summary = compute_summary(db, project_id, period_start, period_end)

    return {
        "period_start": period_start.isoformat(),
        "period_end": period_end.isoformat(),
        "billing_total": round(billing_total, 2),
        "sales_count": len(sales),
        "ok_sales_count": len(ok_sales),
        "ok_total": round(ok_total, 2),
        "fines_total": round(fines_total, 2),
        "total_commissions": summary.get("total_commissions", 0),
        "sales": [
            {
                "id": s.id,
                "sale_code": s.sale_code,
                "participant_name": s.participant.name if s.participant else "",
                "amount": float(s.amount),
                "sale_date": s.sale_date.isoformat() if s.sale_date else None,
                "status": s.status.value,
            }
            for s in sales
        ],
        "fines": [
            {
                "id": f.id,
                "participant_name": f.participant.name if f.participant else "",
                "amount": float(f.amount),
                "notes": f.notes,
            }
            for f in fines
        ],
        "commissions": commission_rows,
    }


def cash_closing_to_dict(closing: CashClosing) -> dict:
    return {
        "id": closing.id,
        "project_id": closing.project_id,
        "period_start": closing.period_start.isoformat(),
        "period_end": closing.period_end.isoformat(),
        "closed_by_id": closing.closed_by_id,
        "closed_by_name": closing.closed_by.name if closing.closed_by else "",
        "closed_at": closing.closed_at.isoformat() if closing.closed_at else None,
        "status": closing.status.value,
        "confirmed_by_id": closing.confirmed_by_id,
        "confirmed_by_name": closing.confirmed_by.name if closing.confirmed_by else None,
        "confirmed_at": closing.confirmed_at.isoformat() if closing.confirmed_at else None,
        "reopened_at": closing.reopened_at.isoformat() if closing.reopened_at else None,
        "reopened_by_id": closing.reopened_by_id,
        "reopened_by_name": closing.reopened_by.name if closing.reopened_by else None,
        "reopen_scope": closing.reopen_scope,
        "report_public_id": closing.report_public_id,
        "report_tabs_locked": bool(closing.report_tabs_locked),
        "clients_received": closing.clients_received,
        "summary_snapshot": closing.summary_snapshot or {},
    }


def create_cash_closing(
    db: Session,
    project_id: int,
    period_start: date,
    period_end: date,
    user: User,
    *,
    skip_privilege_check: bool = False,
    clients_received: int | None = None,
) -> CashClosing:
    if not skip_privilege_check and not user_has_privilege(
        db, user, PRIVILEGE_CASH_CLOSING, project_id=project_id
    ):
        raise HTTPException(403, "Sem privilégio de fechamento de caixa")
    assert_period_accessible_for_user(db, project_id, user, period_start, period_end)

    project = db.get(Project, project_id)
    if project and not skip_privilege_check:
        from app.services.project_finance_config import (
            is_closing_mode_allowed,
            is_within_manual_closing_window,
        )

        scope = "daily" if period_start == period_end else "weekly"
        if not is_closing_mode_allowed(project, scope=scope, mode_needed="manual"):
            raise HTTPException(400, "Fechamento manual desabilitado nas configurações do projeto")
        if scope == "weekly" and not is_within_manual_closing_window(project):
            raise HTTPException(400, "Fora do dia/horário configurado para fechamento manual")

    existing = get_cash_closing(db, project_id, period_start, period_end)
    if existing:
        if existing.reopened_at and existing.reopen_scope == "all":
            snapshot = build_cash_closing_snapshot(db, project_id, period_start, period_end)
            now = datetime.now(timezone.utc)
            existing.summary_snapshot = snapshot
            existing.reopened_at = None
            existing.reopened_by_id = None
            existing.reopen_scope = None
            existing.closed_by_id = user.id
            existing.closed_at = now
            existing.status = CashClosingStatus.confirmed
            existing.confirmed_by_id = user.id
            existing.confirmed_at = now
            if clients_received is not None:
                existing.clients_received = clients_received
            db.commit()
            closing = (
                db.query(CashClosing)
                .options(
                    joinedload(CashClosing.closed_by),
                    joinedload(CashClosing.confirmed_by),
                    joinedload(CashClosing.reopened_by),
                )
                .filter(CashClosing.id == existing.id)
                .first()
            )
            from app.services.automation_notifications import notify_cash_closing_by_non_admin

            notify_cash_closing_by_non_admin(db, project_id, closing.id, user)
            return closing
        raise HTTPException(400, "Já existe fechamento de caixa para este período")

    snapshot = build_cash_closing_snapshot(db, project_id, period_start, period_end)
    now = datetime.now(timezone.utc)
    closing = CashClosing(
        project_id=project_id,
        period_start=period_start,
        period_end=period_end,
        closed_by_id=user.id,
        closed_at=now,
        summary_snapshot=snapshot,
        status=CashClosingStatus.confirmed,
        confirmed_by_id=user.id,
        confirmed_at=now,
        clients_received=clients_received,
    )
    db.add(closing)
    db.commit()
    db.refresh(closing)
    closing = (
        db.query(CashClosing)
        .options(
            joinedload(CashClosing.closed_by),
            joinedload(CashClosing.confirmed_by),
            joinedload(CashClosing.reopened_by),
        )
        .filter(CashClosing.id == closing.id)
        .first()
    )
    from app.services.automation_notifications import notify_cash_closing_by_non_admin

    notify_cash_closing_by_non_admin(db, project_id, closing.id, user)
    return closing


def try_automatic_cash_closing(
    db: Session, project_id: int, period_start: date, period_end: date
) -> bool:
    """Fecha caixa automaticamente se ainda não existir registro. Retorna True se fechou."""
    if get_cash_closing(db, project_id, period_start, period_end):
        return False
    admin = (
        db.query(User)
        .filter(User.level == UserLevel.admin, User.is_active.is_(True))
        .order_by(User.id.asc())
        .first()
    )
    if not admin:
        return False
    try:
        closing = create_cash_closing(
            db,
            project_id,
            period_start,
            period_end,
            admin,
            skip_privilege_check=True,
        )
        snap = dict(closing.summary_snapshot or {})
        snap["closed_via"] = "automatic"
        closing.summary_snapshot = snap
        db.commit()
        return True
    except HTTPException:
        return False


def confirm_cash_closing(
    db: Session, project_id: int, period_start: date, period_end: date, admin: User
) -> CashClosing:
    if admin.level != UserLevel.admin:
        raise HTTPException(403, "Apenas administradores podem confirmar o fechamento")

    closing = get_cash_closing(db, project_id, period_start, period_end)
    if not closing:
        raise HTTPException(404, "Fechamento de caixa não encontrado")
    if closing.status == CashClosingStatus.confirmed:
        raise HTTPException(400, "Fechamento já confirmado")

    closing.status = CashClosingStatus.confirmed
    closing.confirmed_by_id = admin.id
    closing.confirmed_at = datetime.now(timezone.utc)
    db.commit()
    return (
        db.query(CashClosing)
        .options(
            joinedload(CashClosing.closed_by),
            joinedload(CashClosing.confirmed_by),
            joinedload(CashClosing.reopened_by),
        )
        .filter(CashClosing.id == closing.id)
        .first()
    )


def cancel_cash_closing(
    db: Session, project_id: int, period_start: date, period_end: date, admin: User
) -> None:
    if admin.level != UserLevel.admin:
        raise HTTPException(403, "Apenas administradores podem cancelar o fechamento")

    closing = get_cash_closing(db, project_id, period_start, period_end)
    if not closing:
        raise HTTPException(404, "Fechamento de caixa não encontrado")
    if closing.status == CashClosingStatus.confirmed:
        raise HTTPException(400, "Fechamento já confirmado — não pode ser cancelado")

    db.delete(closing)
    db.commit()


def unlock_cash_closing(
    db: Session, project_id: int, period_start: date, period_end: date, admin: User
) -> CashClosing:
    if admin.level != UserLevel.admin:
        raise HTTPException(403, "Apenas administradores podem reabrir o caixa")

    closing = get_cash_closing(db, project_id, period_start, period_end)
    if not closing:
        raise HTTPException(404, "Fechamento de caixa não encontrado")

    was_report_saved = bool(closing.report_tabs_locked)
    closing.reopened_at = datetime.now(timezone.utc)
    closing.reopened_by_id = admin.id
    closing.reopen_scope = "all"
    closing.report_tabs_locked = False

    if not was_report_saved:
        project = db.get(Project, project_id)
        if project:
            from app.services.active_period import sync_active_period_to

            sync_active_period_to(db, project, period_start, period_end)

    db.commit()
    return (
        db.query(CashClosing)
        .options(
            joinedload(CashClosing.closed_by),
            joinedload(CashClosing.confirmed_by),
            joinedload(CashClosing.reopened_by),
        )
        .filter(CashClosing.id == closing.id)
        .first()
    )


def verify_admin_password(db: Session, password: str) -> None:
    from app.auth_utils import verify_password

    admins = db.query(User).filter(User.level == UserLevel.admin, User.is_active.is_(True)).all()
    verified = any(
        a.password_hash and verify_password(password, a.password_hash) for a in admins
    )
    if not verified:
        raise HTTPException(403, "Senha de administrador incorreta")


def reopen_cash_closing(
    db: Session,
    project_id: int,
    period_start: date,
    period_end: date,
    user: User,
    admin_password: str,
    scope: str = "all",
) -> CashClosing:
    verify_admin_password(db, admin_password)
    if scope not in ("all", "admin_only"):
        raise HTTPException(400, "Escopo de reabertura inválido")
    closing = get_cash_closing(db, project_id, period_start, period_end)
    if not closing:
        raise HTTPException(404, "Fechamento de caixa não encontrado")
    if closing.status != CashClosingStatus.confirmed:
        raise HTTPException(400, "Apenas períodos confirmados podem ser reabertos")
    if closing.reopened_at:
        return closing

    was_report_saved = bool(closing.report_tabs_locked)
    closing.reopened_at = datetime.now(timezone.utc)
    closing.reopened_by_id = user.id
    closing.reopen_scope = scope
    closing.report_tabs_locked = False

    if scope == "all" and not was_report_saved:
        project = db.get(Project, project_id)
        if project:
            from app.services.active_period import sync_active_period_to

            sync_active_period_to(db, project, period_start, period_end)

    db.commit()
    return (
        db.query(CashClosing)
        .options(
            joinedload(CashClosing.closed_by),
            joinedload(CashClosing.confirmed_by),
            joinedload(CashClosing.reopened_by),
        )
        .filter(CashClosing.id == closing.id)
        .first()
    )


def build_changes_summary(old: dict, new: dict) -> dict:
    keys = [
        ("billing_total", "Faturamento"),
        ("sales_count", "Qtd. vendas"),
        ("ok_total", "Vendas OK"),
        ("fines_total", "Multas"),
        ("total_commissions", "Comissões"),
    ]
    changes = []
    for key, label in keys:
        before = old.get(key)
        after = new.get(key)
        if before != after:
            changes.append({"field": key, "label": label, "before": before, "after": after})
    return {"changes": changes, "has_changes": len(changes) > 0}


def resave_cash_closing(
    db: Session, project_id: int, period_start: date, period_end: date, user: User
) -> tuple[CashClosing, dict]:
    closing = get_cash_closing(db, project_id, period_start, period_end)
    if not closing:
        raise HTTPException(404, "Fechamento de caixa não encontrado")
    if not closing.reopened_at:
        raise HTTPException(400, "Período não está reaberto para edição")

    old_snapshot = dict(closing.summary_snapshot or {})
    new_snapshot = build_cash_closing_snapshot(db, project_id, period_start, period_end)
    changes = build_changes_summary(old_snapshot, new_snapshot)

    closing.summary_snapshot = new_snapshot
    closing.reopened_at = None
    closing.reopened_by_id = None
    closing.reopen_scope = None
    closing.confirmed_by_id = user.id
    closing.confirmed_at = datetime.now(timezone.utc)
    db.commit()
    closing = (
        db.query(CashClosing)
        .options(
            joinedload(CashClosing.closed_by),
            joinedload(CashClosing.confirmed_by),
            joinedload(CashClosing.reopened_by),
        )
        .filter(CashClosing.id == closing.id)
        .first()
    )
    return closing, changes


def ensure_cash_closing_from_import(
    db: Session,
    project_id: int,
    period_start: date,
    period_end: date,
    user: User,
) -> CashClosing:
    existing = get_cash_closing(db, project_id, period_start, period_end)
    snapshot = build_cash_closing_snapshot(db, project_id, period_start, period_end)
    snapshot["imported"] = True
    now = datetime.now(timezone.utc)
    if existing:
        existing.summary_snapshot = snapshot
        existing.status = CashClosingStatus.confirmed
        existing.confirmed_by_id = user.id
        existing.confirmed_at = now
        existing.reopened_at = None
        existing.reopened_by_id = None
        existing.reopen_scope = None
        db.commit()
        return existing

    closing = CashClosing(
        project_id=project_id,
        period_start=period_start,
        period_end=period_end,
        closed_by_id=user.id,
        closed_at=now,
        summary_snapshot=snapshot,
        status=CashClosingStatus.confirmed,
        confirmed_by_id=user.id,
        confirmed_at=now,
    )
    db.add(closing)
    db.commit()
    return (
        db.query(CashClosing)
        .options(
            joinedload(CashClosing.closed_by),
            joinedload(CashClosing.confirmed_by),
            joinedload(CashClosing.reopened_by),
        )
        .filter(CashClosing.id == closing.id)
        .first()
    )
