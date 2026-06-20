"""Orquestração da importação de PDF — usuários ilustrativos e vínculo ao projeto.

Regra de negócio: o rótulo «Don» nos relatórios representa o administrador.
Participantes com esse rótulo não entram na tabela de comissões nem na de pagamentos.
"""

from __future__ import annotations

import re
from datetime import date, datetime, timezone
from typing import Any

from sqlalchemy.orm import Session

from app.models import (
    Expense,
    Payment,
    PaymentStatus,
    PeriodCommission,
    ProjectMember,
    ReportImportLog,
    Sale,
    SaleStatus,
    User,
    UserLevel,
    generate_sale_code,
)

_SKIP_COMMISSION_LABELS = frozenset({"TODOS", "TODAS", "TODOS OS ATENDENTES"})

# Don no PDF = administrador do projeto (sem comissão nem pagamento na importação).
_ADMINISTRATOR_REPORT_LABELS = frozenset({"DON"})

_ATD_RE = re.compile(r"^ATD\s+(\d+)$", re.I)
_INVALID_LABEL_RE = re.compile(r"^[\d.,]+$")

_LABEL_ALIASES = {
    "FIN": "financeiro",
    "FINANCEIRO": "financeiro",
    "DON": "Don",
    "CT 02": "Contador 02",
}


def normalize_label(label: str) -> str:
    return " ".join((label or "").strip().split()).upper()


def canonical_participant_label(label: str) -> str:
    stripped = (label or "").strip()
    alias = _LABEL_ALIASES.get(normalize_label(stripped))
    return alias if alias else stripped


def is_administrator_report_label(label: str) -> bool:
    """True se o rótulo do PDF representa o administrador (ex.: Don)."""
    canon = canonical_participant_label(label or "")
    return normalize_label(canon) in _ADMINISTRATOR_REPORT_LABELS


def purge_administrator_from_extracted(extracted: dict[str, Any]) -> dict[str, Any]:
    """Remove Don (administrador) do payload extraído do PDF e metadados de sync."""
    data = dict(extracted)

    data["payments"] = [
        p for p in (data.get("payments") or []) if not is_administrator_report_label(p.get("role") or "")
    ]
    data["commissions_summary"] = [
        c
        for c in (data.get("commissions_summary") or [])
        if c.get("aggregate") or not is_administrator_report_label(c.get("participant_label") or c.get("role") or "")
    ]
    data["sales_by_agent"] = [
        a
        for a in (data.get("sales_by_agent") or [])
        if not is_administrator_report_label(a.get("code") or a.get("name") or "")
    ]

    sync = dict(data.get("sync") or {})
    pmap = dict(sync.get("participant_map") or {})
    for key in list(pmap.keys()):
        if is_administrator_report_label(key):
            del pmap[key]
    sync["participant_map"] = pmap
    sync["created"] = [
        c for c in (sync.get("created") or []) if not is_administrator_report_label(c.get("label") or "")
    ]
    sync["matched"] = [
        m for m in (sync.get("matched") or []) if not is_administrator_report_label(m.get("label") or "")
    ]
    sync["period_commissions"] = [
        r for r in (sync.get("period_commissions") or []) if not is_administrator_report_label(r.get("label") or "")
    ]
    data["sync"] = sync
    return data


def is_valid_participant_label(label: str) -> bool:
    if not label or not label.strip():
        return False
    if _INVALID_LABEL_RE.match(label.strip()):
        return False
    if normalize_label(label).startswith("R$"):
        return False
    return len(label.strip()) >= 2


def _atd_number(label: str) -> int | None:
    m = _ATD_RE.match(normalize_label(label))
    return int(m.group(1)) if m else None


def _gerente_number_from_user(user: User) -> int | None:
    for raw in (user.name, user.role_function or ""):
        cand = normalize_label(raw)
        m = re.match(r"^G\s*(\d+)$", cand)
        if m:
            return int(m.group(1))
        if "GERENTE" in cand:
            num = re.search(r"(\d+)", cand)
            if num:
                return int(num.group(1))
    return None


def _labels_match(wanted: str, user: User) -> bool:
    wanted_norm = normalize_label(wanted)
    wanted_atd = _atd_number(wanted_norm)
    if wanted_atd is not None:
        gerente_n = _gerente_number_from_user(user)
        if gerente_n is not None and gerente_n == wanted_atd:
            return True
    for raw in (user.name, user.role_function or ""):
        cand = normalize_label(raw)
        if not cand:
            continue
        if cand == wanted_norm:
            return True
        w_atd = _atd_number(wanted_norm)
        c_atd = _atd_number(cand)
        if w_atd is not None and c_atd is not None and w_atd == c_atd:
            return True
    return False


def collect_participant_labels(extracted: dict[str, Any]) -> list[str]:
    """Rótulos de participantes citados no PDF (ATD, FIN, CT, comissionados)."""
    labels: dict[str, str] = {}

    def add(raw: str | None) -> None:
        if not raw or not is_valid_participant_label(raw):
            return
        canon = canonical_participant_label(raw)
        if not is_valid_participant_label(canon):
            return
        key = normalize_label(canon)
        if key in _SKIP_COMMISSION_LABELS:
            return
        labels[key] = canon

    for row in extracted.get("sales_rows") or []:
        add(row.get("agent"))

    for agent in extracted.get("sales_by_agent") or []:
        add(agent.get("code"))

    for pay in extracted.get("payments") or []:
        add(pay.get("role"))

    for comm in extracted.get("commissions_summary") or []:
        if comm.get("aggregate"):
            continue
        add(comm.get("participant_label") or comm.get("role"))

    return sorted(labels.values(), key=lambda x: (normalize_label(x), x))


def find_project_member_user(db: Session, project_id: int, label: str) -> User | None:
    """Localiza usuário já vinculado ao projeto que corresponde ao rótulo do PDF."""
    label_norm = normalize_label(label)

    members = (
        db.query(ProjectMember, User)
        .join(User, ProjectMember.user_id == User.id)
        .filter(
            ProjectMember.project_id == project_id,
            User.is_active.is_(True),
        )
        .all()
    )

    atd_num = _atd_number(label_norm)
    if atd_num is not None:
        for _, user in members:
            if _gerente_number_from_user(user) == atd_num:
                return user

    if is_administrator_report_label(label):
        for _, user in members:
            if user.level == UserLevel.admin:
                return user

    if label_norm in ("FIN", "FINANCEIRO"):
        for _, user in members:
            if user.level == UserLevel.financeiro:
                return user

    search_labels = [label]
    if label_norm.startswith("CONTADOR ") and len(label_norm.split()) >= 2:
        search_labels.append(f"CT {label_norm.split()[-1]}")
    if label_norm.startswith("CT ") and len(label_norm.split()) >= 2:
        search_labels.append(f"Contador {label_norm.split()[-1]}")

    for candidate in search_labels:
        if candidate != label and normalize_label(candidate) in ("FIN", "FINANCEIRO"):
            continue
        if normalize_label(candidate).startswith("CT "):
            for _, user in members:
                if user.level == UserLevel.contador and _labels_match(candidate, user):
                    return user
            for _, user in members:
                if user.level == UserLevel.contador:
                    return user

        for _, user in members:
            if _labels_match(candidate, user):
                return user

    return None


_GLOBAL_COMMISSION_CATEGORIES = frozenset({"FINANCEIRO", "CONTADOR", "SÓCIO", "SOCIO"})

_PDF_STATUS_MAP = {
    "OK": SaleStatus.ok,
    "PENDENTE": SaleStatus.pendente,
    "BLOQUEADO": SaleStatus.bloqueado,
    "ANALISE": SaleStatus.em_analise,
    "FALSE": SaleStatus.em_analise,
    "PENDENTE_SELFIE": SaleStatus.pendente_selfie,
}


def _commission_percent_from_amounts(base: float, amount: float) -> float:
    if base <= 0:
        return 0.0
    return round(amount / base * 100, 2)


def extract_period_commission_rows(
    extracted: dict[str, Any],
    participant_map: dict[str, int],
) -> list[dict[str, Any]]:
    """
    Extrai % e valores de comissão do PDF para o período importado.
    Não altera ProjectMember — apenas dados para PeriodCommission.
    Don (administrador) é ignorado — não gera linha de comissão.
    """
    fields = extracted.get("fields") or {}
    total_sales = float(fields.get("total_sales") or 0)
    by_user: dict[int, dict[str, Any]] = {}

    def upsert(user_id: int, *, base: float, amount: float, label: str) -> None:
        pct = _commission_percent_from_amounts(base, amount)
        existing = by_user.get(user_id)
        if existing and existing.get("commission_amount", 0) >= amount:
            return
        by_user[user_id] = {
            "participant_id": user_id,
            "label": label,
            "sales_base": round(base, 2),
            "commission_amount": round(amount, 2),
            "commission_percent": pct,
        }

    for agent in extracted.get("sales_by_agent") or []:
        code = agent.get("code") or ""
        if is_administrator_report_label(code):
            continue
        user_id = participant_map.get(normalize_label(code))
        if not user_id:
            continue
        base = float(agent.get("total_amount") or 0)
        amount = float(agent.get("commission") or 0)
        upsert(user_id, base=base, amount=amount, label=code)

    for comm in extracted.get("commissions_summary") or []:
        if comm.get("aggregate"):
            continue
        label = canonical_participant_label(comm.get("participant_label") or comm.get("role") or "")
        if is_administrator_report_label(label):
            continue
        user_id = participant_map.get(normalize_label(label))
        if not user_id:
            continue
        amount = float(comm.get("commission") or 0)
        category = (comm.get("category") or "").upper().replace("Ó", "O")
        if category in _GLOBAL_COMMISSION_CATEGORIES:
            base = total_sales
        else:
            base = total_sales if amount > 0 and total_sales > 0 else 0.0
        upsert(user_id, base=base, amount=amount, label=label)

    for pay in extracted.get("payments") or []:
        role = canonical_participant_label(pay.get("role") or "")
        if is_administrator_report_label(role):
            continue
        user_id = participant_map.get(normalize_label(role))
        if not user_id or user_id in by_user:
            continue
        base = float(pay.get("base_amount") or 0)
        amount = base
        if pay.get("final_amount") is not None and base == 0:
            amount = float(pay.get("final_amount") or 0)
        upsert(user_id, base=base if base > 0 else total_sales, amount=amount, label=role)

    return list(by_user.values())


def sync_period_commissions(
    db: Session,
    project_id: int,
    period_start: date,
    period_end: date,
    extracted: dict[str, Any],
    participant_map: dict[str, int],
    *,
    created_by_id: int | None = None,
) -> list[dict[str, Any]]:
    """
    Persiste comissões do relatório apenas para o período importado.
    Substitui registros anteriores do mesmo período (reimportação).
    """
    db.query(PeriodCommission).filter(
        PeriodCommission.project_id == project_id,
        PeriodCommission.period_start == period_start,
        PeriodCommission.period_end == period_end,
        PeriodCommission.source == "pdf_import",
    ).delete(synchronize_session=False)

    rows = extract_period_commission_rows(extracted, participant_map)
    saved: list[dict[str, Any]] = []
    for row in rows:
        pc = PeriodCommission(
            project_id=project_id,
            participant_id=row["participant_id"],
            period_start=period_start,
            period_end=period_end,
            commission_percent=row["commission_percent"],
            sales_base=row["sales_base"],
            commission_amount=row["commission_amount"],
            source="pdf_import",
            created_by_id=created_by_id,
        )
        db.add(pc)
        saved.append(row)
    return saved


def resolve_participant_map_preview(
    db: Session, project_id: int, extracted: dict[str, Any]
) -> tuple[dict[str, int], dict[int, str]]:
    """Mapeia rótulos do PDF para IDs existentes ou IDs temporários negativos (pré-visualização)."""
    participant_map: dict[str, int] = {}
    names: dict[int, str] = {}
    levels: dict[int, str] = {}
    temp_id = -1
    for label in collect_participant_labels(extracted):
        if is_administrator_report_label(label):
            existing = find_project_member_user(db, project_id, label)
            if existing:
                participant_map[normalize_label(label)] = existing.id
                names[existing.id] = existing.name
                levels[existing.id] = existing.level.value
            continue

        existing = find_project_member_user(db, project_id, label)
        if existing:
            participant_map[normalize_label(label)] = existing.id
            names[existing.id] = existing.name
            levels[existing.id] = existing.level.value
        else:
            participant_map[normalize_label(label)] = temp_id
            names[temp_id] = canonical_participant_label(label)
            levels[temp_id] = UserLevel.ilustrativo.value
            temp_id -= 1
    return participant_map, names, levels


def build_import_preview(
    db: Session,
    project_id: int,
    extracted: dict[str, Any],
    period_start: date,
    period_end: date,
) -> dict[str, Any]:
    """Monta pré-visualização para vendas, despesas, pagamentos e relatório sem gravar no banco."""
    participant_map, names, levels = resolve_participant_map_preview(db, project_id, extracted)
    period_commissions = extract_period_commission_rows(extracted, participant_map)

    sales: list[dict[str, Any]] = []
    for i, row in enumerate(extracted.get("sales_rows") or []):
        agent = row.get("agent") or ""
        pid = participant_map.get(normalize_label(agent), 0)
        status = _PDF_STATUS_MAP.get((row.get("status") or "").upper(), SaleStatus.pendente)
        sales.append(
            {
                "id": -(i + 1),
                "sale_code": f"IMP{i + 1:03d}",
                "participant_id": pid,
                "participant_name": names.get(pid, agent),
                "cnpj": row.get("cnpj"),
                "phone": row.get("phone"),
                "sale_version": row.get("sale_version") or "V1",
                "doc_type": "OUTROS",
                "doc_custom": None,
                "amount": float(row.get("amount") or 0),
                "status": status.value,
                "sale_date": period_end.isoformat(),
                "cp_attachment_url": None,
                "has_cp_attachment": False,
                "created_at": datetime.now(timezone.utc).isoformat(),
                "_import_preview": True,
            }
        )

    expenses: list[dict[str, Any]] = []
    for i, row in enumerate(extracted.get("expenses") or []):
        expenses.append(
            {
                "id": -(i + 1),
                "expense_type": "OUTROS",
                "amount": abs(float(row.get("amount") or 0)),
                "notes": row.get("description") or "Despesa",
                "expense_date": period_end.isoformat(),
                "created_at": datetime.now(timezone.utc).isoformat(),
                "_import_preview": True,
            }
        )

    commissions = []
    for pc in period_commissions:
        pid = pc["participant_id"]
        commissions.append(
            {
                "user_id": pid,
                "user_name": names.get(pid, pc.get("label", "—")),
                "user_level": levels.get(pid, UserLevel.ilustrativo.value),
                "commission_percent": pc["commission_percent"],
                "total_sales_base": pc["sales_base"],
                "commission_amount": pc["commission_amount"],
                "commission_source": "pdf_import",
            }
        )

    payments: list[dict[str, Any]] = []
    for i, pay in enumerate(extracted.get("payments") or []):
        role = canonical_participant_label(pay.get("role") or "")
        if is_administrator_report_label(role):
            continue
        pid = participant_map.get(normalize_label(role), 0)
        base = float(pay.get("base_amount") or (pay.get("amounts") or [0])[0] or 0)
        final = float(pay.get("final_amount") or base)
        adjustment = float(pay.get("adjustment") or 0)
        fine = float(pay.get("fine") or 0)
        payments.append(
            {
                "id": -(i + 1),
                "participant_id": pid,
                "participant_name": names.get(pid, role),
                "base_amount": base,
                "adjustment_amount": adjustment,
                "fine_percent": 0,
                "fine_amount": fine,
                "final_amount": final,
                "apply_fine": fine > 0,
                "status": "pago",
                "period_start": period_start.isoformat(),
                "period_end": period_end.isoformat(),
                "paid_at": datetime.now(timezone.utc).isoformat(),
                "notes": None,
                "payment_destination": None,
                "_import_preview": True,
            }
        )

    fields = extracted.get("fields") or {}
    status_counts = extracted.get("status_counts") or {}
    ok_count = int(fields.get("ok_sales_count") or sum(1 for s in sales if s["status"] == "ok"))
    report = {
        "total_sales": float(fields.get("total_sales") or 0),
        "total_expenses": float(fields.get("total_expenses") or 0),
        "profit": float(fields.get("profit") or 0),
        "ok_sales_count": ok_count,
        "blocked_sales_count": status_counts.get("BLOQUEADO", 0),
        "pending_sales_count": status_counts.get("PENDENTE", 0),
        "analysis_sales_count": status_counts.get("ANALISE", status_counts.get("ÁNALISE", 0)),
        "avg_ticket": round(float(fields.get("total_sales") or 0) / ok_count, 2) if ok_count else 0,
        "sales_by_manager": [
            {
                "participant_id": participant_map.get(normalize_label(a.get("code", "")), 0),
                "participant_name": names.get(
                    participant_map.get(normalize_label(a.get("code", "")), 0),
                    a.get("code", "—"),
                ),
                "sales_count": a.get("sales_count") or a.get("ok_count") or 0,
                "total_amount": a.get("total_amount") or 0,
            }
            for a in (extracted.get("sales_by_agent") or [])
        ],
        "highest_sale": None,
        "comparison": None,
        "week_comparison": None,
        "_import_preview": True,
    }
    if sales:
        top = max((s for s in sales if s["status"] == "ok"), key=lambda s: s["amount"], default=None)
        if top:
            report["highest_sale"] = {
                "sale_code": top["sale_code"],
                "amount": top["amount"],
                "participant_name": top["participant_name"],
                "sale_date": top["sale_date"],
            }

    return {
        "sales": sales,
        "expenses": expenses,
        "payments": payments,
        "commissions": commissions,
        "summary": {
            "total_sales": report["total_sales"],
            "total_commissions": float(fields.get("total_commissions") or sum(c["commission_amount"] for c in commissions)),
            "total_expenses": report["total_expenses"],
            "balance": report["profit"],
            "commissions": commissions,
            "uses_period_commissions": True,
        },
        "report": report,
    }


def _unique_sale_code(db: Session, project_id: int) -> str:
    for _ in range(30):
        code = generate_sale_code()
        exists = (
            db.query(Sale.id)
            .filter(Sale.project_id == project_id, Sale.sale_code == code)
            .first()
        )
        if not exists:
            return code
    raise RuntimeError("Não foi possível gerar código de venda único")


def clear_period_financial_data(
    db: Session, project_id: int, period_start: date, period_end: date
) -> None:
    db.query(Sale).filter(
        Sale.project_id == project_id,
        Sale.sale_date >= period_start,
        Sale.sale_date <= period_end,
    ).delete(synchronize_session=False)
    db.query(Expense).filter(
        Expense.project_id == project_id,
        Expense.expense_date >= period_start,
        Expense.expense_date <= period_end,
    ).delete(synchronize_session=False)
    db.query(Payment).filter(
        Payment.project_id == project_id,
        Payment.period_start == period_start,
        Payment.period_end == period_end,
    ).delete(synchronize_session=False)


def persist_import_sales(
    db: Session,
    project_id: int,
    extracted: dict[str, Any],
    participant_map: dict[str, int],
    period_end: date,
    *,
    created_by_id: int | None = None,
) -> int:
    count = 0
    for row in extracted.get("sales_rows") or []:
        agent = row.get("agent") or ""
        pid = participant_map.get(normalize_label(agent))
        if not pid:
            continue
        status = _PDF_STATUS_MAP.get((row.get("status") or "").upper(), SaleStatus.pendente)
        db.add(
            Sale(
                project_id=project_id,
                participant_id=pid,
                sale_code=_unique_sale_code(db, project_id),
                cnpj=row.get("cnpj"),
                phone=row.get("phone"),
                sale_version=row.get("sale_version") or "V1",
                doc_type="OUTROS",
                amount=float(row.get("amount") or 0),
                status=status,
                sale_date=period_end,
                created_by_id=created_by_id,
            )
        )
        count += 1
    return count


def persist_import_expenses(
    db: Session,
    project_id: int,
    extracted: dict[str, Any],
    period_end: date,
    *,
    created_by_id: int | None = None,
) -> int:
    count = 0
    for row in extracted.get("expenses") or []:
        db.add(
            Expense(
                project_id=project_id,
                expense_type="OUTROS",
                amount=abs(float(row.get("amount") or 0)),
                notes=row.get("description") or "Despesa",
                expense_date=period_end,
                created_by_id=created_by_id,
            )
        )
        count += 1
    return count


def persist_import_payments(
    db: Session,
    project_id: int,
    extracted: dict[str, Any],
    participant_map: dict[str, int],
    period_start: date,
    period_end: date,
) -> int:
    """Persiste pagamentos do PDF. Don (administrador) é omitido."""
    count = 0
    for pay in extracted.get("payments") or []:
        role = canonical_participant_label(pay.get("role") or "")
        if is_administrator_report_label(role):
            continue
        pid = participant_map.get(normalize_label(role))
        if not pid:
            continue
        amounts = pay.get("amounts") or []
        base = float(pay.get("base_amount") or (amounts[0] if amounts else 0))
        final = float(pay.get("final_amount") or (amounts[-1] if amounts else base))
        adjustment = float(pay.get("adjustment") or 0)
        fine = abs(float(pay.get("fine") or 0))
        db.add(
            Payment(
                project_id=project_id,
                participant_id=pid,
                base_amount=base,
                adjustment_amount=adjustment,
                fine_amount=fine,
                fine_percent=0,
                final_amount=final,
                apply_fine=fine > 0,
                status=PaymentStatus.pago,
                paid_at=datetime.now(timezone.utc),
                period_start=period_start,
                period_end=period_end,
            )
        )
        count += 1
    return count


def append_import_log(
    db: Session,
    project_id: int,
    period_start: date,
    period_end: date,
    *,
    original_filename: str | None,
    created_by_id: int | None,
) -> ReportImportLog:
    row = ReportImportLog(
        project_id=project_id,
        period_start=period_start,
        period_end=period_end,
        original_filename=original_filename,
        created_by_id=created_by_id,
        saved_at=datetime.now(timezone.utc),
    )
    db.add(row)
    db.flush()
    return row


def commit_report_import(
    db: Session,
    project_id: int,
    period_start: date,
    period_end: date,
    extracted: dict[str, Any],
    *,
    created_by_id: int | None = None,
    replace_period_data: bool = True,
) -> dict[str, Any]:
    """Grava importação no banco: usuários, comissões do período, vendas, despesas e pagamentos.

    Don nos relatórios é tratado como administrador e não gera comissão nem pagamento.
    """
    if replace_period_data:
        clear_period_financial_data(db, project_id, period_start, period_end)

    extracted = apply_report_import(
        db, project_id, period_start, period_end, extracted, created_by_id=created_by_id
    )
    participant_map = (extracted.get("sync") or {}).get("participant_map") or {}

    stats = {
        "sales": persist_import_sales(
            db, project_id, extracted, participant_map, period_end, created_by_id=created_by_id
        ),
        "expenses": persist_import_expenses(
            db, project_id, extracted, period_end, created_by_id=created_by_id
        ),
        "payments": persist_import_payments(
            db, project_id, extracted, participant_map, period_start, period_end
        ),
    }
    extracted["persist_stats"] = stats
    return extracted


def _default_commission_percent(_label: str, _extracted: dict[str, Any]) -> float:
    """Novos ilustrativos entram com 0% — o período importado usa PeriodCommission."""
    return 0.0


def ensure_ilustrativo_users(
    db: Session,
    project_id: int,
    extracted: dict[str, Any],
) -> dict[str, Any]:
    """
    Garante que cada participante do PDF exista no projeto.
    Comissionados desconhecidos viram usuários ilustrativos (sem login).
    Don é tratado como administrador — apenas vincula ao admin existente, sem ilustrativo.
    """
    created: list[dict[str, Any]] = []
    matched: list[dict[str, Any]] = []
    participant_map: dict[str, int] = {}

    for label in collect_participant_labels(extracted):
        if is_administrator_report_label(label):
            existing = find_project_member_user(db, project_id, label)
            if existing:
                participant_map[normalize_label(label)] = existing.id
                matched.append(
                    {
                        "label": label,
                        "user_id": existing.id,
                        "user_name": existing.name,
                        "level": existing.level.value,
                        "administrator": True,
                    }
                )
            continue

        existing = find_project_member_user(db, project_id, label)
        if existing:
            participant_map[normalize_label(label)] = existing.id
            matched.append(
                {
                    "label": label,
                    "user_id": existing.id,
                    "user_name": existing.name,
                    "level": existing.level.value,
                }
            )
            continue

        display_name = label.strip()
        role_function = display_name
        for comm in extracted.get("commissions_summary") or []:
            if comm.get("aggregate"):
                continue
            pl = comm.get("participant_label") or comm.get("role")
            if pl and normalize_label(pl) == normalize_label(label):
                cat = comm.get("category")
                if cat:
                    role_function = f"{cat} — {display_name}"
                break

        user = User(
            name=display_name,
            role_function=role_function,
            level=UserLevel.ilustrativo,
            is_active=True,
        )
        db.add(user)
        db.flush()

        pct = _default_commission_percent(label, extracted)
        db.add(
            ProjectMember(
                project_id=project_id,
                user_id=user.id,
                commission_percent=pct,
            )
        )

        participant_map[normalize_label(label)] = user.id
        created.append(
            {
                "label": label,
                "user_id": user.id,
                "user_name": user.name,
                "commission_percent": pct,
            }
        )

    return {
        "created": created,
        "matched": matched,
        "participant_map": participant_map,
    }


def apply_report_import(
    db: Session,
    project_id: int,
    period_start: date,
    period_end: date,
    extracted: dict[str, Any],
    *,
    created_by_id: int | None = None,
) -> dict[str, Any]:
    """
    Pós-processamento do PDF extraído: sincroniza participantes no banco.
    Don = administrador (sem comissão nem pagamento na importação).
    Retorna extracted enriquecido com metadados de sincronização.
    """
    sync = ensure_ilustrativo_users(db, project_id, extracted)
    participant_map = sync.get("participant_map") or {}
    period_commissions = sync_period_commissions(
        db,
        project_id,
        period_start,
        period_end,
        extracted,
        participant_map,
        created_by_id=created_by_id,
    )
    extracted = dict(extracted)
    extracted["sync"] = {
        **sync,
        "period_commissions": period_commissions,
        "project_id": project_id,
        "period_start": period_start.isoformat(),
        "period_end": period_end.isoformat(),
        "created_by_id": created_by_id,
    }
    return extracted


def apply_import_to_report(report: dict[str, Any], extracted: dict[str, Any]) -> dict[str, Any]:
    """Mescla dados do PDF importado no relatório do período."""
    merged = dict(report)
    fields = extracted.get("fields") or {}
    template = extracted.get("template")
    participant_map = (extracted.get("sync") or {}).get("participant_map") or {}

    field_map = {
        "total_sales": "total_sales",
        "total_expenses": "total_expenses",
        "total_commissions": "total_commissions",
        "profit": "profit",
    }
    for src, dest in field_map.items():
        if fields.get(src) is not None:
            merged[dest] = fields[src]
            merged[f"{dest}_source"] = "pdf_import"

    if fields.get("gross_profit") is not None:
        merged["gross_profit"] = fields["gross_profit"]
        merged["gross_profit_source"] = "pdf_import"

    if fields.get("ok_sales_count") is not None:
        merged["ok_sales_count"] = fields["ok_sales_count"]
        merged["ok_sales_count_source"] = "pdf_import"

    if fields.get("total_sales") and fields.get("ok_sales_count"):
        merged["avg_ticket"] = round(fields["total_sales"] / fields["ok_sales_count"], 2)

    agents = extracted.get("sales_by_agent") or extracted.get("managers") or []
    if agents:
        merged["sales_by_manager"] = []
        for a in agents:
            code = a.get("code") or a.get("name", "")
            pid = participant_map.get(normalize_label(code), 0)
            merged["sales_by_manager"].append(
                {
                    "participant_id": pid,
                    "participant_name": a.get("name") or code or "—",
                    "sales_count": a.get("sales_count") or a.get("ok_count") or 0,
                    "total_amount": a.get("total_amount") or 0,
                }
            )
        merged["sales_by_manager_source"] = "pdf_import"

    if template == "agencia_fluxo_caixa":
        status = extracted.get("status_counts") or {}
        merged["blocked_sales_count"] = status.get("BLOQUEADO", merged.get("blocked_sales_count", 0))
        merged["pending_sales_count"] = status.get("PENDENTE", merged.get("pending_sales_count", 0))
        merged["analysis_sales_count"] = status.get(
            "ANALISE", status.get("ÁNALISE", merged.get("analysis_sales_count", 0))
        )

    sync = extracted.get("sync") or {}
    if sync.get("created"):
        merged["import_ilustrativos_created"] = sync["created"]
    if sync.get("period_commissions"):
        merged["period_commissions"] = sync["period_commissions"]
        merged["period_commissions_source"] = "pdf_import"

    merged["pdf_import"] = extracted
    return merged
