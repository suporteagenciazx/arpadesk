import httpx

TELEGRAM_ERROR_HINTS = {
    "chat not found": (
        "Chat não encontrado. Adicione o bot ao grupo, envie /start ou uma mensagem "
        "e use o ID no formato de supergrupo (-100…). O sistema corrige IDs antigos automaticamente."
    ),
    "bot was blocked by the user": "O usuário bloqueou o bot.",
    "not enough rights to send": (
        "O bot não tem permissão para enviar mensagens. No grupo, promova o bot a administrador "
        "com permissão de enviar mensagens."
    ),
    "group chat was upgraded to a supergroup": (
        "Este grupo foi convertido em supergrupo. O sistema tentará usar o novo ID automaticamente."
    ),
    "have no rights to send": (
        "O bot não tem permissão para enviar mensagens. Verifique se ele é admin do grupo "
        "com permissão de postar."
    ),
}


class TelegramError(Exception):
    pass


def canonical_chat_id(chat_id: str) -> str:
    """Normaliza IDs de supergrupo para o formato -100… exigido pela API."""
    cid = (chat_id or "").strip()
    if not cid:
        return cid
    if cid.startswith("-100"):
        return cid
    if cid.startswith("-") and cid[1:].isdigit():
        return f"-100{cid[1:]}"
    return cid


def chat_id_candidates(chat_id: str) -> list[str]:
    raw = (chat_id or "").strip()
    if not raw:
        return []
    canonical = canonical_chat_id(raw)
    candidates = [canonical]
    if raw != canonical:
        candidates.append(raw)
    return list(dict.fromkeys(candidates))


def _coerce_chat_id(chat_id: str):
    cid = chat_id.strip()
    if cid.lstrip("-").isdigit():
        return int(cid)
    return cid


def _friendly_error(description: str) -> str:
    lower = (description or "").lower()
    for key, hint in TELEGRAM_ERROR_HINTS.items():
        if key in lower:
            return f"{description}. {hint}"
    return description or "Erro desconhecido do Telegram"


def send_telegram_message(bot_token: str, chat_id: str, text: str) -> dict:
    token = bot_token.strip()
    candidates = chat_id_candidates(chat_id)
    if not candidates:
        raise TelegramError("Chat ID não informado")

    last_description = ""
    url = f"https://api.telegram.org/bot{token}/sendMessage"

    for candidate in candidates:
        payload = {
            "chat_id": _coerce_chat_id(candidate),
            "text": text,
            "disable_web_page_preview": True,
        }
        try:
            with httpx.Client(timeout=20.0) as client:
                response = client.post(url, json=payload)
                data = response.json()
        except httpx.RequestError as exc:
            raise TelegramError(f"Falha de conexão com Telegram: {exc}") from exc

        if response.is_success and data.get("ok"):
            return data

        params = data.get("parameters") if isinstance(data, dict) else None
        migrate_to = params.get("migrate_to_chat_id") if params else None
        if migrate_to:
            payload["chat_id"] = migrate_to
            try:
                with httpx.Client(timeout=20.0) as client:
                    response = client.post(url, json=payload)
                    data = response.json()
            except httpx.RequestError as exc:
                raise TelegramError(f"Falha de conexão com Telegram: {exc}") from exc
            if response.is_success and data.get("ok"):
                return data

        last_description = data.get("description") if isinstance(data, dict) else response.text

    raise TelegramError(_friendly_error(last_description))


def send_telegram_document(
    bot_token: str,
    chat_id: str,
    file_bytes: bytes,
    filename: str,
    caption: str | None = None,
) -> dict:
    token = bot_token.strip()
    candidates = chat_id_candidates(chat_id)
    if not candidates:
        raise TelegramError("Chat ID não informado")

    last_description = ""
    url = f"https://api.telegram.org/bot{token}/sendDocument"

    for candidate in candidates:
        data: dict = {"chat_id": _coerce_chat_id(candidate)}
        if caption:
            data["caption"] = caption[:1024]
            data["disable_web_page_preview"] = True
        files = {"document": (filename, file_bytes)}
        try:
            with httpx.Client(timeout=60.0) as client:
                response = client.post(url, data=data, files=files)
                result = response.json()
        except httpx.RequestError as exc:
            raise TelegramError(f"Falha de conexão com Telegram: {exc}") from exc

        if response.is_success and result.get("ok"):
            return result

        params = result.get("parameters") if isinstance(result, dict) else None
        migrate_to = params.get("migrate_to_chat_id") if params else None
        if migrate_to:
            data["chat_id"] = migrate_to
            try:
                with httpx.Client(timeout=60.0) as client:
                    response = client.post(url, data=data, files=files)
                    result = response.json()
            except httpx.RequestError as exc:
                raise TelegramError(f"Falha de conexão com Telegram: {exc}") from exc
            if response.is_success and result.get("ok"):
                return result

        last_description = result.get("description") if isinstance(result, dict) else response.text

    raise TelegramError(_friendly_error(last_description))


def send_telegram_notification(
    bot_token: str,
    chat_id: str,
    text: str,
    file_bytes: bytes | None = None,
    filename: str | None = None,
) -> dict:
    if file_bytes and filename:
        return send_telegram_document(bot_token, chat_id, file_bytes, filename, caption=text)
    return send_telegram_message(bot_token, chat_id, text)


def resolve_chat_id(bot_token: str, chat_id: str) -> str:
    """Valida e resolve o chat ID (inclui migração para supergrupo)."""
    token = bot_token.strip()
    raw = (chat_id or "").strip()
    if not raw or not token:
        return canonical_chat_id(raw)

    url = f"https://api.telegram.org/bot{token}/getChat"
    for candidate in chat_id_candidates(raw):
        payload = {"chat_id": _coerce_chat_id(candidate)}
        try:
            with httpx.Client(timeout=15.0) as client:
                response = client.post(url, json=payload)
                data = response.json()
        except httpx.RequestError:
            continue
        if data.get("ok"):
            chat = data["result"]
            resolved = str(chat["id"])
            if chat.get("type") == "group":
                migrated = _probe_migrated_chat_id(token, candidate)
                if migrated:
                    return migrated
            return resolved
        params = data.get("parameters") or {}
        migrate_to = params.get("migrate_to_chat_id")
        if migrate_to:
            return str(migrate_to)

    migrated = _probe_migrated_chat_id(token, raw)
    if migrated:
        return migrated
    return canonical_chat_id(raw)


def _probe_migrated_chat_id(bot_token: str, chat_id: str) -> str | None:
    """Detecta migrate_to_chat_id sem deixar mensagem visível no grupo."""
    token = bot_token.strip()
    send_url = f"https://api.telegram.org/bot{token}/sendMessage"
    for candidate in chat_id_candidates(chat_id):
        payload = {
            "chat_id": _coerce_chat_id(candidate),
            "text": "\u200b",
            "disable_notification": True,
        }
        try:
            with httpx.Client(timeout=15.0) as client:
                response = client.post(send_url, json=payload)
                data = response.json()
        except httpx.RequestError:
            continue
        if data.get("ok"):
            msg_id = data.get("result", {}).get("message_id")
            chat = str(data.get("result", {}).get("chat", {}).get("id", candidate))
            if msg_id:
                try:
                    with httpx.Client(timeout=10.0) as client:
                        client.post(
                            f"https://api.telegram.org/bot{token}/deleteMessage",
                            json={"chat_id": _coerce_chat_id(chat), "message_id": msg_id},
                        )
                except httpx.RequestError:
                    pass
            return chat
        params = data.get("parameters") or {}
        migrate_to = params.get("migrate_to_chat_id")
        if migrate_to:
            return str(migrate_to)
    return None


def verify_bot_token(bot_token: str) -> dict:
    url = f"https://api.telegram.org/bot{bot_token.strip()}/getMe"
    try:
        with httpx.Client(timeout=15.0) as client:
            response = client.get(url)
            data = response.json()
    except httpx.RequestError as exc:
        raise TelegramError(f"Falha de conexão com Telegram: {exc}") from exc

    if not data.get("ok"):
        raise TelegramError(data.get("description", "Token inválido"))

    return data.get("result", {})


def get_bot_chat_member(bot_token: str, chat_id: str) -> dict:
    token = bot_token.strip()
    me = verify_bot_token(token)
    bot_id = me.get("id")
    if not bot_id:
        return {}

    for candidate in chat_id_candidates(chat_id):
        url = f"https://api.telegram.org/bot{token}/getChatMember"
        payload = {"chat_id": _coerce_chat_id(candidate), "user_id": bot_id}
        try:
            with httpx.Client(timeout=15.0) as client:
                response = client.post(url, json=payload)
                data = response.json()
        except httpx.RequestError:
            continue
        if data.get("ok"):
            return data.get("result", {})

    return {}


def list_recent_chats(bot_token: str) -> list[dict]:
    url = f"https://api.telegram.org/bot{bot_token.strip()}/getUpdates"
    try:
        with httpx.Client(timeout=15.0) as client:
            response = client.get(url, params={"limit": 50})
            data = response.json()
    except httpx.RequestError as exc:
        raise TelegramError(f"Falha de conexão com Telegram: {exc}") from exc

    if not data.get("ok"):
        raise TelegramError(data.get("description", "Não foi possível listar conversas"))

    chats: dict[str, dict] = {}
    for update in data.get("result", []):
        for key in ("message", "channel_post", "my_chat_member"):
            payload = update.get(key)
            if not payload:
                continue
            chat = payload.get("chat")
            if not chat:
                continue
            cid = str(chat.get("id", ""))
            if not cid:
                continue
            chats[cid] = {
                "id": canonical_chat_id(cid),
                "title": chat.get("title") or chat.get("username") or chat.get("first_name") or cid,
                "type": chat.get("type", ""),
            }
    return list(chats.values())
