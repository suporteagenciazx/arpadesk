from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies import require_admin
from app.models import TelegramSendMode, TelegramSettings, User
from app.schemas import (
    TelegramBotSettingsIn,
    TelegramNotificationSettingsIn,
    TelegramSettingsOut,
    TelegramTestIn,
    TelegramTestOut,
)
from app.services.telegram import (
    TelegramError,
    canonical_chat_id,
    get_bot_chat_member,
    list_recent_chats,
    resolve_chat_id,
    send_telegram_message,
    verify_bot_token,
)
from app.services.telegram_templates import (
    DEFAULT_CONFIRMATION_TEMPLATE,
    DEFAULT_REGISTRATION_TEMPLATE,
    TELEGRAM_VARIABLE_GROUPS,
    render_template,
    sample_context,
)

router = APIRouter(prefix="/api/telegram", tags=["telegram"])


def _get_or_create(db: Session) -> TelegramSettings:
    row = db.get(TelegramSettings, 1)
    if not row:
        row = TelegramSettings(id=1)
        db.add(row)
        db.commit()
        db.refresh(row)
    return row


def _resolve_chat_id(row: TelegramSettings, kind: str) -> str | None:
    if kind == "registration":
        raw = row.registration_chat_id or row.chat_id
    elif kind == "confirmation":
        raw = row.confirmation_chat_id or row.chat_id
    else:
        raw = row.chat_id
    return canonical_chat_id(raw) if raw else None


def _settings_out(row: TelegramSettings) -> TelegramSettingsOut:
    confirmation = row.confirmation_template or row.message_template or DEFAULT_CONFIRMATION_TEMPLATE
    registration = row.registration_template or DEFAULT_REGISTRATION_TEMPLATE
    reg_chat = _resolve_chat_id(row, "registration")
    conf_chat = _resolve_chat_id(row, "confirmation")
    return TelegramSettingsOut(
        bot_token=row.bot_token,
        chat_id=canonical_chat_id(row.chat_id) if row.chat_id else None,
        send_mode=row.send_mode.value if row.send_mode else "group",
        message_template=confirmation,
        registration_chat_id=reg_chat,
        registration_send_mode=(
            row.registration_send_mode.value if row.registration_send_mode else "group"
        ),
        registration_template=registration,
        notify_on_registration=bool(row.notify_on_registration),
        attach_cp_on_registration=bool(row.attach_cp_on_registration),
        confirmation_chat_id=conf_chat,
        confirmation_send_mode=(
            row.confirmation_send_mode.value if row.confirmation_send_mode else "group"
        ),
        confirmation_template=confirmation,
        notify_on_confirmation=bool(row.notify_on_confirmation),
        attach_cp_on_confirmation=bool(row.attach_cp_on_confirmation),
        has_token=bool(row.bot_token),
    )


@router.get("/variables")
def list_variables(_: User = Depends(require_admin)):
    return {"groups": TELEGRAM_VARIABLE_GROUPS}


@router.get("/settings", response_model=TelegramSettingsOut)
def get_settings(_: User = Depends(require_admin), db: Session = Depends(get_db)):
    return _settings_out(_get_or_create(db))


@router.put("/settings/bot", response_model=TelegramSettingsOut)
def save_bot_settings(
    data: TelegramBotSettingsIn,
    _: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    row = _get_or_create(db)
    if data.bot_token is not None and data.bot_token.strip():
        row.bot_token = data.bot_token.strip()
    db.commit()
    db.refresh(row)
    return _settings_out(row)


@router.put("/settings/registration", response_model=TelegramSettingsOut)
def save_registration_settings(
    data: TelegramNotificationSettingsIn,
    _: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    row = _get_or_create(db)
    if data.chat_id is not None:
        raw = data.chat_id.strip()
        if raw and row.bot_token:
            row.registration_chat_id = resolve_chat_id(row.bot_token, raw)
        else:
            row.registration_chat_id = None
    if data.send_mode:
        row.registration_send_mode = TelegramSendMode(data.send_mode)
    if data.template is not None:
        row.registration_template = data.template
    if data.enabled is not None:
        row.notify_on_registration = data.enabled
    if data.attach_cp is not None:
        row.attach_cp_on_registration = data.attach_cp
    db.commit()
    db.refresh(row)
    return _settings_out(row)


@router.put("/settings/confirmation", response_model=TelegramSettingsOut)
def save_confirmation_settings(
    data: TelegramNotificationSettingsIn,
    _: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    row = _get_or_create(db)
    if data.chat_id is not None:
        raw = data.chat_id.strip()
        if raw and row.bot_token:
            row.confirmation_chat_id = resolve_chat_id(row.bot_token, raw)
        else:
            row.confirmation_chat_id = None
    if data.send_mode:
        row.confirmation_send_mode = TelegramSendMode(data.send_mode)
    if data.template is not None:
        row.confirmation_template = data.template
        row.message_template = data.template
    if data.enabled is not None:
        row.notify_on_confirmation = data.enabled
    if data.attach_cp is not None:
        row.attach_cp_on_confirmation = data.attach_cp
    db.commit()
    db.refresh(row)
    return _settings_out(row)


@router.get("/chats")
def discover_chats(_: User = Depends(require_admin), db: Session = Depends(get_db)):
    row = _get_or_create(db)
    if not row.bot_token:
        raise HTTPException(400, "Configure o token do bot antes de listar conversas")
    try:
        chats = list_recent_chats(row.bot_token)
    except TelegramError as exc:
        raise HTTPException(400, str(exc)) from exc
    return {"chats": chats}


def _send_test_message(token: str, chat_id: str, message: str, raw_chat_id: str | None) -> TelegramTestOut:
    bot_info = verify_bot_token(token)
    member = get_bot_chat_member(token, chat_id)
    result = send_telegram_message(token, chat_id, message)
    status = member.get("status", "")
    extra = ""
    if status:
        extra = f" Status do bot no destino: {status}."
    if raw_chat_id and canonical_chat_id(raw_chat_id.strip()) != raw_chat_id.strip():
        extra += f" ID ajustado para supergrupo: {chat_id}."
    return TelegramTestOut(
        ok=True,
        message=f"Mensagem de teste enviada com sucesso.{extra}",
        bot_username=bot_info.get("username"),
        message_id=result.get("result", {}).get("message_id"),
    )


@router.post("/test/bot", response_model=TelegramTestOut)
def test_bot_connection(
    data: TelegramTestIn,
    _: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    row = _get_or_create(db)
    token = (data.bot_token or row.bot_token or "").strip()
    if not token:
        raise HTTPException(400, "Informe o token do bot")
    try:
        bot_info = verify_bot_token(token)
    except TelegramError as exc:
        raise HTTPException(400, str(exc)) from exc
    return TelegramTestOut(
        ok=True,
        message=f"Token válido. Bot conectado: @{bot_info.get('username', 'bot')}",
        bot_username=bot_info.get("username"),
    )


@router.post("/test/registration", response_model=TelegramTestOut)
def test_registration_notification(
    data: TelegramTestIn,
    _: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    row = _get_or_create(db)
    token = (row.bot_token or "").strip()
    if not token:
        raise HTTPException(400, "Configure o token do bot na seção de conexão")
    raw_chat = (data.chat_id or row.registration_chat_id or row.chat_id or "").strip()
    chat_id = canonical_chat_id(raw_chat) if raw_chat else ""
    if not chat_id:
        raise HTTPException(400, "Informe o destino (grupo, canal ou usuário)")
    template = (data.template or row.registration_template or DEFAULT_REGISTRATION_TEMPLATE).strip()
    message = (data.message or "").strip() or render_template(template, sample_context()).strip()
    if not message:
        raise HTTPException(400, "Informe uma mensagem ou template")
    try:
        return _send_test_message(token, chat_id, message, raw_chat)
    except TelegramError as exc:
        raise HTTPException(400, str(exc)) from exc


@router.post("/test/confirmation", response_model=TelegramTestOut)
def test_confirmation_notification(
    data: TelegramTestIn,
    _: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    row = _get_or_create(db)
    token = (row.bot_token or "").strip()
    if not token:
        raise HTTPException(400, "Configure o token do bot na seção de conexão")
    raw_chat = (data.chat_id or row.confirmation_chat_id or row.chat_id or "").strip()
    chat_id = canonical_chat_id(raw_chat) if raw_chat else ""
    if not chat_id:
        raise HTTPException(400, "Informe o destino (grupo, canal ou usuário)")
    template = (
        data.template
        or row.confirmation_template
        or row.message_template
        or DEFAULT_CONFIRMATION_TEMPLATE
    ).strip()
    message = (data.message or "").strip() or render_template(template, sample_context()).strip()
    if not message:
        raise HTTPException(400, "Informe uma mensagem ou template")
    try:
        return _send_test_message(token, chat_id, message, raw_chat)
    except TelegramError as exc:
        raise HTTPException(400, str(exc)) from exc
