from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies import require_admin
from app.models import TelegramSendMode, TelegramSettings, User
from app.schemas import (
    TelegramBotCreateIn,
    TelegramBotOut,
    TelegramBotSettingsIn,
    TelegramBotUpdateIn,
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
from app.services.telegram_bot import (
    bot_to_dict,
    create_telegram_bot,
    delete_telegram_bot,
    ensure_legacy_telegram_bots,
    get_active_bot_token,
    list_telegram_bots,
    update_telegram_bot,
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


def _settings_out(row: TelegramSettings, db: Session) -> TelegramSettingsOut:
    confirmation = row.confirmation_template or row.message_template or DEFAULT_CONFIRMATION_TEMPLATE
    registration = row.registration_template or DEFAULT_REGISTRATION_TEMPLATE
    reg_chat = _resolve_chat_id(row, "registration")
    conf_chat = _resolve_chat_id(row, "confirmation")
    bots = [TelegramBotOut(**b) for b in list_telegram_bots(db)]
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
        has_token=bool(get_active_bot_token(db)),
        registration_bot_id=row.registration_bot_id,
        confirmation_bot_id=row.confirmation_bot_id,
        bots=bots,
    )


def _token_for_request(db: Session, bot_id: int | None = None, bot_token: str | None = None) -> str:
    if bot_token and bot_token.strip():
        return bot_token.strip()
    token = get_active_bot_token(db, bot_id)
    if token:
        return token
    raise HTTPException(400, "Configure pelo menos um bot ativo na aba Conexões")


@router.get("/variables")
def list_variables(_: User = Depends(require_admin)):
    return {"groups": TELEGRAM_VARIABLE_GROUPS}


@router.get("/bots", response_model=list[TelegramBotOut])
def get_bots(_: User = Depends(require_admin), db: Session = Depends(get_db)):
    ensure_legacy_telegram_bots(db)
    return [TelegramBotOut(**b) for b in list_telegram_bots(db)]


@router.post("/bots", response_model=TelegramBotOut, status_code=201)
def create_bot(
    data: TelegramBotCreateIn,
    _: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    try:
        bot = create_telegram_bot(
            db,
            display_name=data.display_name,
            username=data.username,
            bot_token=data.bot_token,
        )
    except TelegramError as exc:
        raise HTTPException(400, str(exc)) from exc
    return TelegramBotOut(**bot_to_dict(bot))


@router.patch("/bots/{bot_id}", response_model=TelegramBotOut)
def patch_bot(
    bot_id: int,
    data: TelegramBotUpdateIn,
    _: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    try:
        bot = update_telegram_bot(
            db,
            bot_id,
            display_name=data.display_name,
            username=data.username,
            bot_token=data.bot_token,
            is_active=data.is_active,
            refresh_avatar=bool(data.bot_token and data.bot_token.strip()),
        )
    except TelegramError as exc:
        raise HTTPException(400, str(exc)) from exc
    return TelegramBotOut(**bot_to_dict(bot))


@router.delete("/bots/{bot_id}", status_code=204)
def remove_bot(bot_id: int, _: User = Depends(require_admin), db: Session = Depends(get_db)):
    try:
        delete_telegram_bot(db, bot_id)
    except TelegramError as exc:
        raise HTTPException(400, str(exc)) from exc


@router.get("/settings", response_model=TelegramSettingsOut)
def get_settings(_: User = Depends(require_admin), db: Session = Depends(get_db)):
    ensure_legacy_telegram_bots(db)
    return _settings_out(_get_or_create(db), db)


@router.put("/settings/bot", response_model=TelegramSettingsOut)
def save_bot_settings(
    data: TelegramBotSettingsIn,
    _: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    if data.bot_token and data.bot_token.strip():
        bots = list_telegram_bots(db)
        try:
            if bots:
                update_telegram_bot(
                    db,
                    bots[0]["id"],
                    bot_token=data.bot_token,
                    refresh_avatar=True,
                )
            else:
                create_telegram_bot(
                    db,
                    display_name="Bot principal",
                    username=None,
                    bot_token=data.bot_token,
                )
        except TelegramError as exc:
            raise HTTPException(400, str(exc)) from exc
    row = _get_or_create(db)
    db.refresh(row)
    return _settings_out(row, db)


@router.put("/settings/registration", response_model=TelegramSettingsOut)
def save_registration_settings(
    data: TelegramNotificationSettingsIn,
    _: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    row = _get_or_create(db)
    token = get_active_bot_token(db, data.bot_id) if data.bot_id else get_active_bot_token(db)
    if data.chat_id is not None:
        raw = data.chat_id.strip()
        if raw and token:
            row.registration_chat_id = resolve_chat_id(token, raw)
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
    if data.bot_id is not None:
        row.registration_bot_id = data.bot_id if data.bot_id > 0 else None
    db.commit()
    db.refresh(row)
    return _settings_out(row, db)


@router.put("/settings/confirmation", response_model=TelegramSettingsOut)
def save_confirmation_settings(
    data: TelegramNotificationSettingsIn,
    _: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    row = _get_or_create(db)
    token = get_active_bot_token(db, data.bot_id) if data.bot_id else get_active_bot_token(db)
    if data.chat_id is not None:
        raw = data.chat_id.strip()
        if raw and token:
            row.confirmation_chat_id = resolve_chat_id(token, raw)
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
    if data.bot_id is not None:
        row.confirmation_bot_id = data.bot_id if data.bot_id > 0 else None
    db.commit()
    db.refresh(row)
    return _settings_out(row, db)


@router.get("/chats")
def discover_chats(
    bot_id: int | None = Query(None),
    _: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    token = get_active_bot_token(db, bot_id)
    if not token:
        raise HTTPException(400, "Configure pelo menos um bot ativo na aba Conexões")
    try:
        chats = list_recent_chats(token)
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
    try:
        token = _token_for_request(db, data.bot_id, data.bot_token)
        bot_info = verify_bot_token(token)
    except HTTPException:
        raise
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
    token = get_active_bot_token(db, data.bot_id or row.registration_bot_id)
    if not token:
        raise HTTPException(400, "Configure pelo menos um bot ativo na aba Conexões")
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
    token = get_active_bot_token(db, data.bot_id or row.confirmation_bot_id)
    if not token:
        raise HTTPException(400, "Configure pelo menos um bot ativo na aba Conexões")
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
