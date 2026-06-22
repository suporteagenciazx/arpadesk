"""Clientes (CNPJ) sincronizados a partir de vendas confirmadas ao salvar relatório."""

from __future__ import annotations

from datetime import date

from sqlalchemy.orm import Session

from app.models import ProjectClient, Sale, SaleStatus


def normalize_cnpj(raw: str | None) -> str | None:
    if not raw:
        return None
    digits = "".join(c for c in str(raw) if c.isdigit())
    if len(digits) < 11:
        return None
    return digits


def format_cnpj_display(digits: str) -> str:
    if len(digits) == 14:
        return f"{digits[:2]}.{digits[2:5]}.{digits[5:8]}/{digits[8:12]}-{digits[12:]}"
    if len(digits) == 11:
        return f"{digits[:3]}.{digits[3:6]}.{digits[6:9]}-{digits[9:]}"
    return digits


def _ok_sales_for_project(db: Session, project_id: int) -> list[Sale]:
    return (
        db.query(Sale)
        .filter(
            Sale.project_id == project_id,
            Sale.status == SaleStatus.ok,
            Sale.cnpj.isnot(None),
            Sale.cnpj != "",
        )
        .order_by(Sale.sale_date.asc(), Sale.created_at.asc())
        .all()
    )


def aggregate_sales_by_cnpj(db: Session, project_id: int) -> dict[str, dict]:
    agg: dict[str, dict] = {}
    for sale in _ok_sales_for_project(db, project_id):
        key = normalize_cnpj(sale.cnpj)
        if not key:
            continue
        bucket = agg.setdefault(
            key,
            {
                "sales_count": 0,
                "total_paid": 0.0,
                "first_sale_date": sale.sale_date,
                "sales": [],
            },
        )
        bucket["sales_count"] += 1
        bucket["total_paid"] = round(bucket["total_paid"] + float(sale.amount or 0), 2)
        if sale.sale_date and (
            not bucket["first_sale_date"] or sale.sale_date < bucket["first_sale_date"]
        ):
            bucket["first_sale_date"] = sale.sale_date
        bucket["sales"].append(sale)
    return agg


def sync_clients_from_saved_report(
    db: Session, project_id: int, period_start: date, period_end: date
) -> None:
    sales = (
        db.query(Sale)
        .filter(
            Sale.project_id == project_id,
            Sale.sale_date >= period_start,
            Sale.sale_date <= period_end,
            Sale.status == SaleStatus.ok,
            Sale.cnpj.isnot(None),
            Sale.cnpj != "",
        )
        .all()
    )
    for sale in sales:
        cnpj = normalize_cnpj(sale.cnpj)
        if not cnpj:
            continue
        client = (
            db.query(ProjectClient)
            .filter(ProjectClient.project_id == project_id, ProjectClient.cnpj == cnpj)
            .first()
        )
        if not client:
            client = ProjectClient(
                project_id=project_id,
                cnpj=cnpj,
                phone=sale.phone,
                registered_at=sale.sale_date,
            )
            db.add(client)
            continue
        if sale.phone and not client.phone:
            client.phone = sale.phone
        if sale.sale_date and (
            not client.registered_at or sale.sale_date < client.registered_at
        ):
            client.registered_at = sale.sale_date

    agg = aggregate_sales_by_cnpj(db, project_id)
    clients = db.query(ProjectClient).filter(ProjectClient.project_id == project_id).all()
    for client in clients:
        stats = agg.get(client.cnpj)
        if stats and stats.get("first_sale_date"):
            if not client.registered_at or stats["first_sale_date"] < client.registered_at:
                client.registered_at = stats["first_sale_date"]


def client_to_dict(db: Session, client: ProjectClient) -> dict:
    agg = aggregate_sales_by_cnpj(db, client.project_id)
    stats = agg.get(client.cnpj, {})
    return {
        "id": client.id,
        "cnpj": client.cnpj,
        "cnpj_display": format_cnpj_display(client.cnpj),
        "phone": client.phone,
        "estado": client.estado,
        "porte": client.porte,
        "opening_date": client.opening_date.isoformat() if client.opening_date else None,
        "email": client.email,
        "registered_at": client.registered_at.isoformat() if client.registered_at else None,
        "sales_count": stats.get("sales_count", 0),
        "total_paid": stats.get("total_paid", 0.0),
    }


def client_sales_list(db: Session, client: ProjectClient) -> list[dict]:
    agg = aggregate_sales_by_cnpj(db, client.project_id)
    stats = agg.get(client.cnpj, {})
    rows = []
    for sale in stats.get("sales", []):
        rows.append(
            {
                "id": sale.id,
                "sale_code": sale.sale_code,
                "amount": float(sale.amount or 0),
                "sale_date": sale.sale_date.isoformat() if sale.sale_date else None,
                "phone": sale.phone,
                "status": sale.status.value,
            }
        )
    rows.sort(key=lambda r: r["sale_date"] or "", reverse=True)
    return rows
