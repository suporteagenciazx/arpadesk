from datetime import datetime, timezone

from fastapi import APIRouter
from sqlalchemy import text

from app.config import settings
from app.database import engine

router = APIRouter(prefix="/api", tags=["health"])


@router.get("/health")
async def health():
    db_status = "ok"
    db_tables = 0
    try:
        with engine.connect() as conn:
            db_tables = conn.execute(
                text("SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public'")
            ).scalar_one()
    except Exception as exc:
        db_status = f"error: {exc.__class__.__name__}"

    return {
        "status": "ok" if db_status == "ok" else "degraded",
        "service": "arpadesk-api",
        "environment": settings.environment,
        "database": {"status": db_status, "public_tables": db_tables},
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }
