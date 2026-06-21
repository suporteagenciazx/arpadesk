from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies import require_admin, user_has_project_access
from app.models import Project, User
from app.schemas import ProjectAutomationOut, ProjectAutomationTestIn, ProjectAutomationUpdateIn
from app.services.project_automation import (
    automation_to_dict,
    get_project_automation,
    list_project_automations,
)
from app.services.telegram import TelegramError, canonical_chat_id, resolve_chat_id
from app.services.telegram_bot import get_active_bot_token, list_telegram_bots
from app.services.telegram_templates import render_template, sample_context

router = APIRouter(prefix="/api/projects", tags=["automations"])


def _require_project_admin(project_id: int, user: User, db: Session) -> Project:
    if user.level.value != "admin":
        raise HTTPException(403, "Apenas administradores")
    project = db.get(Project, project_id)
    if not project:
        raise HTTPException(404, "Projeto não encontrado")
    if not user_has_project_access(db, user, project_id):
        raise HTTPException(403, "Sem acesso ao projeto")
    return project


@router.get("/{project_id}/automations", response_model=list[ProjectAutomationOut])
def get_automations(
    project_id: int,
    user: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    _require_project_admin(project_id, user, db)
    return list_project_automations(db, project_id)


@router.patch("/{project_id}/automations/{automation_id}", response_model=ProjectAutomationOut)
def update_automation(
    project_id: int,
    automation_id: int,
    data: ProjectAutomationUpdateIn,
    user: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    _require_project_admin(project_id, user, db)
    row = get_project_automation(db, project_id, automation_id)
    if not row:
        raise HTTPException(404, "Automação não encontrada")

    if data.name is not None and data.name.strip():
        row.name = data.name.strip()
    if data.description is not None:
        row.description = data.description.strip() or None
    if data.is_enabled is not None:
        row.is_enabled = data.is_enabled

    if data.config is not None:
        config = dict(row.config or {})
        incoming = data.config.model_dump(exclude_unset=True)
        if "chat_id" in incoming and incoming["chat_id"] is not None:
            raw = incoming["chat_id"].strip()
            bot_id = incoming.get("bot_id", config.get("bot_id"))
            token = get_active_bot_token(db, bot_id)
            if raw and token:
                config["chat_id"] = resolve_chat_id(token, raw)
            else:
                config["chat_id"] = raw
        for key in ("send_mode", "template", "attach_cp", "bot_id"):
            if key in incoming and incoming[key] is not None:
                if key == "bot_id" and incoming[key] == 0:
                    config["bot_id"] = None
                else:
                    config[key] = incoming[key]
        row.config = config

    db.commit()
    db.refresh(row)
    return automation_to_dict(row)


@router.delete("/{project_id}/automations/{automation_id}", status_code=204)
def delete_automation(
    project_id: int,
    automation_id: int,
    user: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    _require_project_admin(project_id, user, db)
    row = get_project_automation(db, project_id, automation_id)
    if not row:
        raise HTTPException(404, "Automação não encontrada")
    db.delete(row)
    db.commit()


@router.post("/{project_id}/automations/{automation_id}/test")
def test_automation(
    project_id: int,
    automation_id: int,
    data: ProjectAutomationTestIn,
    user: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    from app.services.telegram import get_bot_chat_member, send_telegram_message, verify_bot_token

    _require_project_admin(project_id, user, db)
    row = get_project_automation(db, project_id, automation_id)
    if not row:
        raise HTTPException(404, "Automação não encontrada")

    config = row.config or {}
    bot_id = data.bot_id if data.bot_id is not None else config.get("bot_id")
    token = get_active_bot_token(db, bot_id)
    if not token:
        raise HTTPException(400, "Configure pelo menos um bot ativo em Configurações → Telegram")

    raw_chat = (data.chat_id or config.get("chat_id") or "").strip()
    chat_id = canonical_chat_id(raw_chat) if raw_chat else ""
    if not chat_id:
        raise HTTPException(400, "Informe o destino (grupo, canal ou usuário)")

    template = (data.template or config.get("template") or "").strip()
    message = (data.message or "").strip() or render_template(template, sample_context()).strip()
    if not message:
        raise HTTPException(400, "Informe uma mensagem ou template")

    try:
        bot_info = verify_bot_token(token)
        member = get_bot_chat_member(token, chat_id)
        result = send_telegram_message(token, chat_id, message)
        status = member.get("status", "")
        extra = f" Status do bot no destino: {status}." if status else ""
        if raw_chat and canonical_chat_id(raw_chat) != raw_chat:
            extra += f" ID ajustado para supergrupo: {chat_id}."
        from app.schemas import TelegramTestOut

        return TelegramTestOut(
            ok=True,
            message=f"Mensagem de teste enviada com sucesso.{extra}",
            bot_username=bot_info.get("username"),
            message_id=result.get("result", {}).get("message_id"),
        )
    except TelegramError as exc:
        raise HTTPException(400, str(exc)) from exc


@router.get("/{project_id}/automations/meta/bots")
def automation_bots(
    project_id: int,
    user: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    _require_project_admin(project_id, user, db)
    return {"bots": list_telegram_bots(db)}
