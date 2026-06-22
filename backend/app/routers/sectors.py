from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies import get_current_user, require_admin
from app.models import User
from app.schemas import SectorRegistryOut
from app.services.sector_registry import load_sector_registry, sidebar_sectors

router = APIRouter(prefix="/api/sectors", tags=["sectors"])


@router.get("", response_model=SectorRegistryOut)
def list_sectors(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    registry = load_sector_registry(db)
    return SectorRegistryOut(sectors=registry)


@router.get("/sidebar", response_model=SectorRegistryOut)
def list_sidebar_sectors(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    registry = load_sector_registry(db)
    return SectorRegistryOut(sectors=sidebar_sectors(registry))
