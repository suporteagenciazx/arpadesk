from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies import require_admin
from app.models import Project, User
from app.schemas import (
    GestaoDashboardOut,
    GestaoProjectOut,
    ProjectSectorsPatch,
    SectorRegistryOut,
    SectorRegistryUpdate,
)
from app.services.gestao_dashboard import build_gestao_dashboard
from app.services.project_sectors import patch_project_sectors, sectors_public
from app.services.sector_registry import load_sector_registry, save_sector_registry

router = APIRouter(prefix="/api/gestao", tags=["gestao"])


@router.get("/sectors", response_model=SectorRegistryOut)
def get_sector_registry(admin: User = Depends(require_admin), db: Session = Depends(get_db)):
    return SectorRegistryOut(sectors=load_sector_registry(db))


@router.put("/sectors", response_model=SectorRegistryOut)
def update_sector_registry(
    body: SectorRegistryUpdate,
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    try:
        sectors = save_sector_registry(db, [s.model_dump() for s in body.sectors])
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc
    db.commit()
    return SectorRegistryOut(sectors=sectors)


@router.get("/dashboard", response_model=GestaoDashboardOut)
def get_gestao_dashboard(
    period_start: str | None = Query(None),
    period_end: str | None = Query(None),
    project_ids: str | None = Query(None, description="IDs separados por vírgula"),
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    ps = date.fromisoformat(period_start) if period_start else None
    pe = date.fromisoformat(period_end) if period_end else None
    if project_ids:
        ids = [int(x.strip()) for x in project_ids.split(",") if x.strip()]
    else:
        ids = [row[0] for row in db.query(Project.id).filter(Project.is_active.is_(True)).all()]
    if not ids:
        return GestaoDashboardOut(
            period_start=ps.isoformat() if ps else None,
            period_end=pe.isoformat() if pe else None,
            project_count=0,
            totals={
                "billing_total": 0,
                "expenses_total": 0,
                "investment_total": 0,
                "profit_total": 0,
                "commissions_paid_total": 0,
                "roas_ratio": None,
                "roi_percent": None,
                "cash_closings_count": 0,
            },
            by_project=[],
        )
    data = build_gestao_dashboard(db, ids, ps, pe)
    return GestaoDashboardOut(**data)


@router.get("/projects", response_model=list[GestaoProjectOut])
def list_gestao_projects(admin: User = Depends(require_admin), db: Session = Depends(get_db)):
    registry = load_sector_registry(db)
    projects = db.query(Project).filter(Project.is_active.is_(True)).order_by(Project.name).all()
    rows: list[dict] = []
    for p in projects:
        rows.append(
            {
                "id": p.id,
                "name": p.name,
                "slug": p.slug,
                "description": p.description,
                "sectors": sectors_public(p.settings, registry),
            }
        )
    return [GestaoProjectOut(**row) for row in rows]


@router.patch("/projects/{project_id}/sectors", response_model=GestaoProjectOut)
def update_project_sectors(
    project_id: int,
    body: ProjectSectorsPatch,
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    registry = load_sector_registry(db)
    project = db.get(Project, project_id)
    if not project or not project.is_active:
        raise HTTPException(404, "Projeto não encontrado")
    patch = {item.sector_id: item.enabled for item in body.sectors}
    patch_project_sectors(project, patch, registry=registry)
    db.commit()
    db.refresh(project)
    return GestaoProjectOut(
        id=project.id,
        name=project.name,
        slug=project.slug,
        description=project.description,
        sectors=sectors_public(project.settings, registry),
    )
