"""Operações com bots Telegram (conexões múltiplas)."""

from __future__ import annotations

import base64

import httpx
from sqlalchemy.orm import Session

from app.models import TelegramBot, TelegramSettings
from app.services.telegram import TelegramError, verify_bot_token


def normalize_bot_username(username: str | None) -> str | None:
    if not username:
        return None
    value = username.strip().lstrip("@").lower()
    return value or None


def fetch_bot_profile_avatar(bot_token: str) -> str | None:
    """
    Busca a foto de perfil do bot na API do Telegram e retorna data URL (base64).
    Retorna None se o bot não tiver foto ou a API falhar.
    """
    token = bot_token.strip()
    me = verify_bot_token(token)
    user_id = me.get("id")
    if not user_id:
        return None

    photos_url = f"https://api.telegram.org/bot{token}/getUserProfilePhotos"
    try:
        with httpx.Client(timeout=20.0) as client:
            photos_resp = client.get(photos_url, params={"user_id": user_id, "limit": 1})
            photos_data = photos_resp.json()
    except httpx.RequestError:
        return None

    if not photos_data.get("ok"):
        return None

    photos = photos_data.get("result", {}).get("photos") or []
    if not photos or not photos[0]:
        return None

    file_id = photos[0][-1].get("file_id")
    if not file_id:
        return None

    file_url = f"https://api.telegram.org/bot{token}/getFile"
    try:
        with httpx.Client(timeout=20.0) as client:
            file_resp = client.get(file_url, params={"file_id": file_id})
            file_data = file_resp.json()
    except httpx.RequestError:
        return None

    if not file_data.get("ok"):
        return None

    file_path = file_data.get("result", {}).get("file_path")
    if not file_path:
        return None

    download_url = f"https://api.telegram.org/file/bot{token}/{file_path}"
    try:
        with httpx.Client(timeout=30.0) as client:
            img_resp = client.get(download_url)
            img_resp.raise_for_status()
            content = img_resp.content
            content_type = img_resp.headers.get("content-type", "image/jpeg").split(";")[0]
    except httpx.RequestError:
        return None

    if not content:
        return None

    encoded = base64.b64encode(content).decode("ascii")
    return f"data:{content_type};base64,{encoded}"


def bot_to_dict(bot: TelegramBot, *, include_token: bool = False) -> dict:
    return {
        "id": bot.id,
        "display_name": bot.display_name,
        "username": bot.username,
        "is_active": bool(bot.is_active),
        "avatar_url": bot.avatar_url,
        "has_token": bool(bot.bot_token),
        "bot_token": bot.bot_token if include_token else None,
        "created_at": bot.created_at.isoformat() if bot.created_at else None,
        "updated_at": bot.updated_at.isoformat() if bot.updated_at else None,
    }


def list_telegram_bots(db: Session) -> list[dict]:
    bots = db.query(TelegramBot).order_by(TelegramBot.id.asc()).all()
    return [bot_to_dict(b) for b in bots]


def get_telegram_bot(db: Session, bot_id: int) -> TelegramBot | None:
    return db.query(TelegramBot).filter(TelegramBot.id == bot_id).first()


def get_active_bot_token(db: Session, bot_id: int | None = None) -> str | None:
    if bot_id:
        bot = get_telegram_bot(db, bot_id)
        if bot and bot.is_active and bot.bot_token:
            return bot.bot_token.strip()
        return None

    bot = (
        db.query(TelegramBot)
        .filter(TelegramBot.is_active.is_(True))
        .order_by(TelegramBot.id.asc())
        .first()
    )
    if bot and bot.bot_token:
        return bot.bot_token.strip()

    settings = db.get(TelegramSettings, 1)
    if settings and settings.bot_token:
        return settings.bot_token.strip()
    return None


def resolve_bot_for_automation(db: Session, kind: str) -> tuple[str | None, TelegramBot | None]:
    settings = db.get(TelegramSettings, 1)
    bot_id = None
    if settings:
        if kind == "registration":
            bot_id = settings.registration_bot_id
        elif kind == "confirmation":
            bot_id = settings.confirmation_bot_id

    if bot_id:
        bot = get_telegram_bot(db, bot_id)
        if bot and bot.is_active and bot.bot_token:
            return bot.bot_token.strip(), bot

    bot = (
        db.query(TelegramBot)
        .filter(TelegramBot.is_active.is_(True))
        .order_by(TelegramBot.id.asc())
        .first()
    )
    if bot and bot.bot_token:
        return bot.bot_token.strip(), bot

    if settings and settings.bot_token:
        return settings.bot_token.strip(), None
    return None, None


def create_telegram_bot(
    db: Session,
    *,
    display_name: str,
    username: str | None,
    bot_token: str,
) -> TelegramBot:
    token = bot_token.strip()
    if not token:
        raise TelegramError("Informe o token do bot")

    me = verify_bot_token(token)
    api_username = (me.get("username") or "").lower()
    normalized = normalize_bot_username(username)
    if normalized and api_username and normalized != api_username:
        raise TelegramError(
            f"O @ informado (@{normalized}) não corresponde ao bot do token (@{api_username})"
        )

    final_username = normalized or api_username or None
    final_name = (display_name or me.get("first_name") or "Bot").strip()
    avatar_url = fetch_bot_profile_avatar(token)

    bot = TelegramBot(
        display_name=final_name,
        username=final_username,
        bot_token=token,
        avatar_url=avatar_url,
        is_active=True,
    )
    db.add(bot)
    db.commit()
    db.refresh(bot)
    _sync_legacy_settings_token(db)
    return bot


def update_telegram_bot(
    db: Session,
    bot_id: int,
    *,
    display_name: str | None = None,
    username: str | None = None,
    bot_token: str | None = None,
    is_active: bool | None = None,
    refresh_avatar: bool = False,
) -> TelegramBot:
    bot = get_telegram_bot(db, bot_id)
    if not bot:
        raise TelegramError("Bot não encontrado")

    token = bot.bot_token
    if bot_token is not None and bot_token.strip():
        token = bot_token.strip()
        me = verify_bot_token(token)
        api_username = (me.get("username") or "").lower()
        normalized = normalize_bot_username(username) if username is not None else bot.username
        if normalized and api_username and normalized != api_username:
            raise TelegramError(
                f"O @ informado (@{normalized}) não corresponde ao bot do token (@{api_username})"
            )
        bot.bot_token = token
        if username is not None:
            bot.username = normalized or api_username or bot.username
        elif api_username:
            bot.username = api_username
        refresh_avatar = True

    if display_name is not None and display_name.strip():
        bot.display_name = display_name.strip()

    if username is not None and not (bot_token and bot_token.strip()):
        bot.username = normalize_bot_username(username)

    if is_active is not None:
        bot.is_active = is_active

    if refresh_avatar:
        bot.avatar_url = fetch_bot_profile_avatar(token)

    db.commit()
    db.refresh(bot)
    _sync_legacy_settings_token(db)
    return bot


def delete_telegram_bot(db: Session, bot_id: int) -> None:
    bot = get_telegram_bot(db, bot_id)
    if not bot:
        raise TelegramError("Bot não encontrado")
    db.delete(bot)
    db.commit()
    _sync_legacy_settings_token(db)


def _sync_legacy_settings_token(db: Session) -> None:
    """Mantém compatibilidade com código legado que lê telegram_settings.bot_token."""
    from sqlalchemy import text

    bot = (
        db.query(TelegramBot)
        .filter(TelegramBot.is_active.is_(True))
        .order_by(TelegramBot.id.asc())
        .first()
    )
    token_str = bot.bot_token.strip() if bot and bot.bot_token else None
    db.execute(
        text("UPDATE telegram_settings SET bot_token = :token WHERE id = 1"),
        {"token": token_str},
    )
    db.commit()


def ensure_legacy_telegram_bots(db: Session) -> None:
    """Garante que o bot legado em telegram_settings exista na lista de conexões."""
    from sqlalchemy import text

    existing = db.query(TelegramBot).count()
    if existing == 0:
        row = db.execute(text("SELECT bot_token FROM telegram_settings WHERE id = 1")).first()
        token = (row[0] or "").strip() if row else ""
        if token:
            try:
                me = verify_bot_token(token)
                name = me.get("first_name") or "Bot principal"
                username = (me.get("username") or "").lower() or None
                avatar = fetch_bot_profile_avatar(token)
                bot = TelegramBot(
                    display_name=name,
                    username=username,
                    bot_token=token,
                    avatar_url=avatar,
                    is_active=True,
                )
                db.add(bot)
                db.commit()
            except TelegramError:
                db.rollback()
        return

    updated = False
    for bot in db.query(TelegramBot).all():
        if not bot.bot_token:
            continue
        try:
            if not bot.username or not bot.avatar_url:
                me = verify_bot_token(bot.bot_token)
                if not bot.username and me.get("username"):
                    bot.username = me["username"].lower()
                    updated = True
                if not bot.avatar_url:
                    bot.avatar_url = fetch_bot_profile_avatar(bot.bot_token)
                    updated = True
        except TelegramError:
            continue
    if updated:
        db.commit()
    _sync_legacy_settings_token(db)
