"""TEMPORÁRIO — atribui IDs públicos de 5 dígitos a relatórios retardatários/importados.

Uso:
  docker compose -f docker-compose.dev.yml exec backend python scripts/backfill_report_public_ids.py
  docker compose -f docker-compose.dev.yml exec backend python scripts/backfill_report_public_ids.py --project-id 1
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.database import SessionLocal
from app.database_migrations import run_migrations
from app.services.report_archive import backfill_retroactive_report_public_ids


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--project-id", type=int, default=None)
    args = parser.parse_args()
    run_migrations()
    db = SessionLocal()
    try:
        count = backfill_retroactive_report_public_ids(db, args.project_id)
        print(f"IDs atribuídos: {count}")
    finally:
        db.close()


if __name__ == "__main__":
    main()
