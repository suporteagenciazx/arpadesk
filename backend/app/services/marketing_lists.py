"""Disparos e listas de marketing por semana."""

from __future__ import annotations

from datetime import date, datetime

from fastapi import HTTPException
from sqlalchemy.orm import Session, joinedload

from app.models import MarketingChannel, MarketingDispatch, MarketingList, Project
from app.services.project_marketing_config import is_marketing_enabled


def _parse_channel(value: str) -> MarketingChannel:
    try:
        return MarketingChannel(value)
    except ValueError as exc:
        raise HTTPException(400, "Canal inválido. Use sms ou whatsapp.") from exc


def get_or_create_dispatch(
    db: Session,
    project_id: int,
    period_start: date,
    period_end: date,
    channel: MarketingChannel,
) -> MarketingDispatch:
    dispatch = (
        db.query(MarketingDispatch)
        .filter(
            MarketingDispatch.project_id == project_id,
            MarketingDispatch.period_start == period_start,
            MarketingDispatch.period_end == period_end,
            MarketingDispatch.channel == channel,
        )
        .first()
    )
    if dispatch:
        return dispatch
    dispatch = MarketingDispatch(
        project_id=project_id,
        period_start=period_start,
        period_end=period_end,
        channel=channel,
    )
    db.add(dispatch)
    db.flush()
    return dispatch


def list_week_lists(
    db: Session, project_id: int, period_start: date, period_end: date
) -> list[dict]:
    dispatches = (
        db.query(MarketingDispatch)
        .options(joinedload(MarketingDispatch.lists))
        .filter(
            MarketingDispatch.project_id == project_id,
            MarketingDispatch.period_start == period_start,
            MarketingDispatch.period_end == period_end,
        )
        .order_by(MarketingDispatch.channel.asc(), MarketingDispatch.id.asc())
        .all()
    )
    rows: list[dict] = []
    for d in dispatches:
        for lst in sorted(d.lists, key=lambda x: x.id):
            rows.append(_list_to_dict(lst, d))
    return rows


def _list_to_dict(lst: MarketingList, dispatch: MarketingDispatch) -> dict:
    return {
        "id": lst.id,
        "dispatch_id": dispatch.id,
        "channel": dispatch.channel.value,
        "name": lst.name,
        "exported_at": lst.exported_at.isoformat() if lst.exported_at else None,
        "sent_at": lst.sent_at.isoformat() if lst.sent_at else None,
        "investment_amount": float(lst.investment_amount or 0),
        "message_count": int(lst.message_count or 0),
        "has_attachment": bool(lst.attachment_object_key),
    }


def create_list(
    db: Session,
    project: Project,
    period_start: date,
    period_end: date,
    data: dict,
) -> dict:
    if not is_marketing_enabled(project):
        raise HTTPException(400, "Marketing não habilitado para este projeto")
    channel = _parse_channel(data.get("channel") or "sms")
    dispatch = get_or_create_dispatch(db, project.id, period_start, period_end, channel)
    exported_at = date.fromisoformat(data["exported_at"]) if data.get("exported_at") else None
    sent_at = date.fromisoformat(data["sent_at"]) if data.get("sent_at") else None
    lst = MarketingList(
        dispatch_id=dispatch.id,
        name=(data.get("name") or "").strip() or "Lista",
        exported_at=exported_at,
        sent_at=sent_at,
        investment_amount=data.get("investment_amount") or 0,
        message_count=int(data.get("message_count") or 0),
    )
    db.add(lst)
    db.commit()
    db.refresh(lst)
    return _list_to_dict(lst, dispatch)


def update_list(db: Session, project_id: int, list_id: int, data: dict) -> dict:
    lst = (
        db.query(MarketingList)
        .join(MarketingDispatch)
        .filter(MarketingList.id == list_id, MarketingDispatch.project_id == project_id)
        .first()
    )
    if not lst:
        raise HTTPException(404, "Lista não encontrada")
    dispatch = lst.dispatch
    if "name" in data and data["name"]:
        lst.name = data["name"].strip()
    if "exported_at" in data:
        lst.exported_at = date.fromisoformat(data["exported_at"]) if data["exported_at"] else None
    if "sent_at" in data:
        lst.sent_at = date.fromisoformat(data["sent_at"]) if data["sent_at"] else None
    if "investment_amount" in data:
        lst.investment_amount = data["investment_amount"]
    if "message_count" in data:
        lst.message_count = int(data["message_count"] or 0)
    db.commit()
    db.refresh(lst)
    return _list_to_dict(lst, dispatch)


def delete_list(db: Session, project_id: int, list_id: int) -> None:
    lst = (
        db.query(MarketingList)
        .join(MarketingDispatch)
        .filter(MarketingList.id == list_id, MarketingDispatch.project_id == project_id)
        .first()
    )
    if not lst:
        raise HTTPException(404, "Lista não encontrada")
    from app.services.storage import delete_object

    delete_object(lst.attachment_object_key)
    db.delete(lst)
    db.commit()


def set_list_attachment(db: Session, project_id: int, list_id: int, object_key: str) -> dict:
    lst = (
        db.query(MarketingList)
        .join(MarketingDispatch)
        .filter(MarketingList.id == list_id, MarketingDispatch.project_id == project_id)
        .first()
    )
    if not lst:
        raise HTTPException(404, "Lista não encontrada")
    from app.services.storage import delete_object

    delete_object(lst.attachment_object_key)
    lst.attachment_object_key = object_key
    db.commit()
    db.refresh(lst)
    return _list_to_dict(lst, lst.dispatch)
