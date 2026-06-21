"""Agendador de fechamento automático de caixa."""

from __future__ import annotations

import asyncio
import logging
from datetime import datetime

from app.database import SessionLocal
from app.models import Project
from app.services.cash_closing import try_automatic_cash_closing
from app.services.project_finance_config import (
    should_run_automatic_daily,
    should_run_automatic_weekly,
)

logger = logging.getLogger(__name__)


def process_automatic_closings(db) -> int:
    """Executa fechamentos automáticos pendentes. Retorna quantidade fechada."""
    now = datetime.now()
    count = 0
    projects = db.query(Project).filter(Project.is_active.is_(True)).all()
    for project in projects:
        weekly = should_run_automatic_weekly(project, now)
        if weekly:
            if try_automatic_cash_closing(db, project.id, weekly[0], weekly[1]):
                count += 1
                continue
        daily = should_run_automatic_daily(project, now)
        if daily:
            if try_automatic_cash_closing(db, project.id, daily, daily):
                count += 1
    return count


async def closing_scheduler_loop() -> None:
    while True:
        await asyncio.sleep(60)
        db = SessionLocal()
        try:
            closed = process_automatic_closings(db)
            if closed:
                logger.info("Fechamento automático: %s período(s) fechado(s)", closed)
        except Exception:
            logger.exception("Erro no agendador de fechamento")
        finally:
            db.close()
