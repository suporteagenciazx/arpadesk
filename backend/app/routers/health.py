from datetime import datetime, timezone

from fastapi import APIRouter

from app.config import settings

router = APIRouter(prefix="/api", tags=["health"])


@router.get("/health")
async def health():
    return {
        "status": "ok",
        "service": "arpadesk-api",
        "environment": settings.environment,
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }
