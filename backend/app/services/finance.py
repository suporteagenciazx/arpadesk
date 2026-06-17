import re

from datetime import date, timedelta

from sqlalchemy.orm import Session, joinedload

from app.services.calendar import operational_week_range, previous_operational_week

from app.models import (
    DEFAULT_DOC_TYPES,
    DEFAULT_EXPENSE_TYPES,
    Expense,
    PeriodCommission,
    Project,
    ProjectMember,
    ReportImport,
    Sale,
    SaleStatus,
    User,
    UserLevel,
)
from app.auth_utils import hash_password
from app.config import settings

GLOBAL_COMMISSION_LEVELS = {UserLevel.contador, UserLevel.financeiro}

LEVEL_SORT_ORDER = {
    UserLevel.contador: 0,
    UserLevel.financeiro: 1,
    UserLevel.ilustrativo: 2,
    UserLevel.agente: 3,
}


def _commission_sort_key(row: dict) -> tuple:
    level_str = row.get("user_level", "")
    try:
        pri = LEVEL_SORT_ORDER.get(UserLevel(level_str), 99)
    except ValueError:
        pri = 99
    name = (row.get("user_name") or "").lower()
    g_num = 999
    if "gerente" in name or re.search(r"\bg\d", name):
        m = re.search(r"(\d+)", name)
        g_num = int(m.group(1)) if m else 0
    return (pri, g_num, name)


def sort_commissions(rows: list[dict]) -> list[dict]:
    return sorted(rows, key=_commission_sort_key)


def slugify(name: str) -> str:
    return name.lower().strip().replace(" ", "-")


def _filter_sales_by_period(query, period_start: date | None, period_end: date | None):
    if period_start:
        query = query.filter(Sale.sale_date >= period_start)
    if period_end:
        query = query.filter(Sale.sale_date <= period_end)
    return query


def previous_period(period_start: date | None, period_end: date | None) -> tuple[date | None, date | None]:
    if not period_start or not period_end:
        return None, None
    length = (period_end - period_start).days
    prev_end = period_start - timedelta(days=1)
    prev_start = prev_end - timedelta(days=length)
    return prev_start, prev_end


def pct_change(current: float, previous: float) -> float:
    if previous == 0:
        return 100.0 if current > 0 else 0.0
    return round((current - previous) / abs(previous) * 100, 2)


def _ensure_finance_demo_users(db: Session) -> None:
    from decimal import Decimal

    project = db.query(Project).filter(Project.slug == "agencia").first()
    if not project:
        return

    financeiro = db.query(User).filter(User.email == "financeiro@arpadesk.local").first()
    if not financeiro:
        financeiro = User(
            name="Financeiro Demo",
            role_function="Financeiro",
            email="financeiro@arpadesk.local",
            password_hash=hash_password("Financeiro@123"),
            level=UserLevel.financeiro,
        )
        db.add(financeiro)
        db.flush()
    elif financeiro.level != UserLevel.financeiro:
        financeiro.level = UserLevel.financeiro

    contador = db.query(User).filter(User.email == "contador@arpadesk.local").first()
    if not contador:
        legacy = db.query(User).filter(User.email == "agente@arpadesk.local").first()
        contador = legacy
    if not contador:
        contador = User(
            name="Contador Demo",
            role_function="Contador",
            email="contador@arpadesk.local",
            password_hash=hash_password("Contador@123"),
            level=UserLevel.contador,
        )
        db.add(contador)
        db.flush()
    elif contador.level not in (UserLevel.contador, UserLevel.agente):
        contador.level = UserLevel.contador
    elif contador.email == "contador@arpadesk.local" and contador.level == UserLevel.agente:
        contador.level = UserLevel.contador

    for user, pct in ((financeiro, Decimal("10")), (contador, Decimal("8"))):
        exists = (
            db.query(ProjectMember)
            .filter(ProjectMember.project_id == project.id, ProjectMember.user_id == user.id)
            .first()
        )
        if not exists:
            db.add(
                ProjectMember(
                    project_id=project.id,
                    user_id=user.id,
                    commission_percent=pct,
                )
            )

    db.commit()


def seed_database(db: Session) -> None:
    agencia = db.query(Project).filter(Project.slug == "agencia").first()
    if agencia and agencia.description != "Projeto Restrito":
        agencia.description = "Projeto Restrito"
        db.commit()

    _ensure_finance_demo_users(db)

    if db.query(User).filter(User.email == settings.seeded_admin_email).first():
        return

    admin = User(
        name=settings.seeded_admin_name,
        role_function="Administrador",
        email=settings.seeded_admin_email,
        password_hash=hash_password(settings.seeded_admin_password),
        level=UserLevel.admin,
    )
    db.add(admin)
    db.flush()

    financeiro = User(
        name="Financeiro Demo",
        role_function="Financeiro",
        email="financeiro@arpadesk.local",
        password_hash=hash_password("Financeiro@123"),
        level=UserLevel.financeiro,
    )
    contador = User(
        name="Contador Demo",
        role_function="Contador",
        email="contador@arpadesk.local",
        password_hash=hash_password("Contador@123"),
        level=UserLevel.contador,
        whatsapp="5511999999999",
    )
    db.add_all([financeiro, contador])

    illus1 = User(
        name="Gerente 1",
        role_function="Gerente",
        level=UserLevel.ilustrativo,
    )
    illus2 = User(
        name="Colaborador Ilustrativo 2",
        role_function="Comissionado",
        level=UserLevel.ilustrativo,
    )
    db.add_all([illus1, illus2])
    db.flush()

    project = Project(
        name="AGENCIA",
        slug="agencia",
        description="Projeto Restrito",
        settings={
            "doc_types": DEFAULT_DOC_TYPES,
            "expense_types": DEFAULT_EXPENSE_TYPES,
        },
    )
    db.add(project)
    db.flush()

    db.add_all(
        [
            ProjectMember(project_id=project.id, user_id=financeiro.id, commission_percent=10),
            ProjectMember(project_id=project.id, user_id=contador.id, commission_percent=8),
            ProjectMember(project_id=project.id, user_id=illus1.id, commission_percent=5),
            ProjectMember(project_id=project.id, user_id=illus2.id, commission_percent=5),
            ProjectMember(project_id=project.id, user_id=admin.id, commission_percent=0),
        ]
    )

    db.commit()


def _period_commission_rows(
    db: Session, project_id: int, period_start: date | None, period_end: date | None
) -> list[tuple[PeriodCommission, User]]:
    if not period_start or not period_end:
        return []
    return (
        db.query(PeriodCommission, User)
        .join(User, PeriodCommission.participant_id == User.id)
        .filter(
            PeriodCommission.project_id == project_id,
            PeriodCommission.period_start == period_start,
            PeriodCommission.period_end == period_end,
        )
        .all()
    )


def _import_fields_for_period(
    db: Session, project_id: int, period_start: date | None, period_end: date | None
) -> dict | None:
    if not period_start or not period_end:
        return None
    imp = (
        db.query(ReportImport)
        .filter(
            ReportImport.project_id == project_id,
            ReportImport.period_start == period_start,
            ReportImport.period_end == period_end,
        )
        .first()
    )
    if not imp or not imp.extracted_data:
        return None
    return imp.extracted_data.get("fields") or {}


def compute_commissions(db: Session, project_id: int, period_start=None, period_end=None) -> list[dict]:
    period_rows = _period_commission_rows(db, project_id, period_start, period_end)
    if period_rows:
        result = []
        for pc, user in period_rows:
            if user.level == UserLevel.admin:
                continue
            base = float(pc.sales_base or 0)
            pct = float(pc.commission_percent or 0)
            if pc.commission_amount is not None:
                amount = float(pc.commission_amount)
            else:
                amount = round(base * pct / 100, 2)
            result.append(
                {
                    "user_id": user.id,
                    "user_name": user.name,
                    "user_level": user.level.value,
                    "commission_percent": pct,
                    "total_sales_base": round(base, 2),
                    "commission_amount": round(amount, 2),
                    "commission_source": pc.source,
                }
            )
        return sort_commissions(result)

    members = (
        db.query(ProjectMember, User)
        .join(User, ProjectMember.user_id == User.id)
        .filter(ProjectMember.project_id == project_id)
        .all()
    )
    sales_q = db.query(Sale).filter(
        Sale.project_id == project_id,
        Sale.status == SaleStatus.ok,
    )
    sales_q = _filter_sales_by_period(sales_q, period_start, period_end)
    sales = sales_q.all()
    total_sales = sum(float(s.amount) for s in sales)

    result = []
    for member, user in members:
        if user.level == UserLevel.admin:
            continue
        pct = float(member.commission_percent or 0)
        if user.level == UserLevel.ilustrativo:
            base = sum(float(s.amount) for s in sales if s.participant_id == user.id)
        elif user.level in GLOBAL_COMMISSION_LEVELS:
            base = total_sales
        else:
            continue
        result.append(
            {
                "user_id": user.id,
                "user_name": user.name,
                "user_level": user.level.value,
                "commission_percent": pct,
                "total_sales_base": round(base, 2),
                "commission_amount": round(base * pct / 100, 2),
            }
        )
    return sort_commissions(result)


def compute_summary(db: Session, project_id: int, period_start=None, period_end=None) -> dict:
    sales_q = db.query(Sale).filter(Sale.project_id == project_id, Sale.status == SaleStatus.ok)
    exp_q = db.query(Expense).filter(Expense.project_id == project_id)
    sales_q = _filter_sales_by_period(sales_q, period_start, period_end)
    if period_start:
        exp_q = exp_q.filter(Expense.expense_date >= period_start)
    if period_end:
        exp_q = exp_q.filter(Expense.expense_date <= period_end)

    total_sales = sum(float(s.amount) for s in sales_q.all())
    total_expenses = sum(float(e.amount) for e in exp_q.all())

    period_rows = _period_commission_rows(db, project_id, period_start, period_end)
    pdf_fields = _import_fields_for_period(db, project_id, period_start, period_end) or {}
    if period_rows and pdf_fields:
        if pdf_fields.get("total_sales") is not None:
            total_sales = float(pdf_fields["total_sales"])
        if pdf_fields.get("total_expenses") is not None and total_expenses == 0:
            total_expenses = float(pdf_fields["total_expenses"])

    commissions = compute_commissions(db, project_id, period_start, period_end)
    if period_rows and pdf_fields.get("total_commissions") is not None:
        total_commissions = float(pdf_fields["total_commissions"])
    else:
        total_commissions = sum(c["commission_amount"] for c in commissions)
    balance = round(total_sales - total_commissions + total_expenses, 2)

    return {
        "total_sales": round(total_sales, 2),
        "total_commissions": round(total_commissions, 2),
        "total_expenses": round(total_expenses, 2),
        "balance": balance,
        "commissions": commissions,
        "uses_period_commissions": bool(period_rows),
    }


def compute_report(db: Session, project_id: int, period_start: date | None, period_end: date | None) -> dict:
    summary = compute_summary(db, project_id, period_start, period_end)

    all_sales = (
        _filter_sales_by_period(
            db.query(Sale).options(joinedload(Sale.participant)).filter(Sale.project_id == project_id),
            period_start,
            period_end,
        )
        .all()
    )

    ok_sales = [s for s in all_sales if s.status == SaleStatus.ok]
    blocked_count = sum(1 for s in all_sales if s.status == SaleStatus.bloqueado)
    pending_count = sum(1 for s in all_sales if s.status == SaleStatus.pendente)
    analysis_count = sum(1 for s in all_sales if s.status == SaleStatus.em_analise)

    highest_sale = None
    if ok_sales:
        top = max(ok_sales, key=lambda s: float(s.amount))
        highest_sale = {
            "sale_code": top.sale_code,
            "amount": float(top.amount),
            "participant_name": top.participant.name if top.participant else "",
            "sale_date": top.sale_date.isoformat(),
        }

    avg_ticket = round(summary["total_sales"] / len(ok_sales), 2) if ok_sales else 0.0

    manager_map: dict[int, dict] = {}
    for sale in ok_sales:
        pid = sale.participant_id
        if pid not in manager_map:
            manager_map[pid] = {
                "participant_id": pid,
                "participant_name": sale.participant.name if sale.participant else "—",
                "sales_count": 0,
                "total_amount": 0.0,
            }
        manager_map[pid]["sales_count"] += 1
        manager_map[pid]["total_amount"] = round(
            manager_map[pid]["total_amount"] + float(sale.amount), 2
        )

    sales_by_manager = sorted(manager_map.values(), key=lambda x: x["total_amount"], reverse=True)

    prev_start, prev_end = previous_period(period_start, period_end)
    prev_summary = (
        compute_summary(db, project_id, prev_start, prev_end) if prev_start and prev_end else None
    )

    today = date.today()
    week_start, week_end = operational_week_range(today)
    last_week_start, last_week_end = previous_operational_week(week_start, week_end)
    week_current = compute_summary(db, project_id, week_start, week_end)
    week_previous = compute_summary(db, project_id, last_week_start, last_week_end)

    comparison = {
        "sales_pct": pct_change(summary["total_sales"], prev_summary["total_sales"]) if prev_summary else None,
        "expenses_pct": pct_change(summary["total_expenses"], prev_summary["total_expenses"]) if prev_summary else None,
        "profit_pct": pct_change(summary["balance"], prev_summary["balance"]) if prev_summary else None,
        "previous_period_start": prev_start.isoformat() if prev_start else None,
        "previous_period_end": prev_end.isoformat() if prev_end else None,
    }

    week_comparison = {
        "sales_pct": pct_change(week_current["total_sales"], week_previous["total_sales"]),
        "expenses_pct": pct_change(week_current["total_expenses"], week_previous["total_expenses"]),
        "profit_pct": pct_change(week_current["balance"], week_previous["balance"]),
        "current_week_start": week_start.isoformat(),
        "current_week_end": week_end.isoformat(),
        "previous_week_start": last_week_start.isoformat(),
        "previous_week_end": last_week_end.isoformat(),
    }

    return {
        "period_start": period_start.isoformat() if period_start else None,
        "period_end": period_end.isoformat() if period_end else None,
        "total_sales": summary["total_sales"],
        "total_commissions": summary["total_commissions"],
        "total_expenses": summary["total_expenses"],
        "profit": summary["balance"],
        "avg_ticket": avg_ticket,
        "highest_sale": highest_sale,
        "ok_sales_count": len(ok_sales),
        "blocked_sales_count": blocked_count,
        "pending_sales_count": pending_count,
        "analysis_sales_count": analysis_count,
        "total_sales_count": len(all_sales),
        "sales_by_manager": sales_by_manager,
        "comparison": comparison,
        "week_comparison": week_comparison,
    }
