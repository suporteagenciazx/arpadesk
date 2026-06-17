from __future__ import annotations

import json
from typing import Any, Callable

import redis

from app.config import settings

_client: redis.Redis | None = None


def cache_enabled() -> bool:
    return bool(settings.redis_url)


def get_redis() -> redis.Redis | None:
    global _client
    if not cache_enabled():
        return None
    if _client is None:
        _client = redis.from_url(settings.redis_url, decode_responses=True)
    return _client


def cache_get(key: str) -> Any | None:
    client = get_redis()
    if not client:
        return None
    try:
        raw = client.get(key)
        return json.loads(raw) if raw else None
    except (redis.RedisError, json.JSONDecodeError):
        return None


def cache_set(key: str, value: Any, ttl: int | None = None) -> None:
    client = get_redis()
    if not client:
        return
    try:
        client.setex(key, ttl or settings.redis_cache_ttl, json.dumps(value, default=str))
    except redis.RedisError:
        pass


def cache_delete_prefix(prefix: str) -> None:
    client = get_redis()
    if not client:
        return
    try:
        for key in client.scan_iter(f"{prefix}*"):
            client.delete(key)
    except redis.RedisError:
        pass


def cached_json(key: str, builder: Callable[[], Any], ttl: int | None = None) -> Any:
    hit = cache_get(key)
    if hit is not None:
        return hit
    value = builder()
    cache_set(key, value, ttl)
    return value
