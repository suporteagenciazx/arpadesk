from datetime import date

from fastapi import APIRouter, Body, Depends, File, HTTPException, Query, UploadFile
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies import get_current_user, require_admin, user_has_project_access
from app.models import Project, ProjectClient, User, UserLevel
from app.schemas import (
    MarketingClientsReceivedPatch,
    MarketingListCreate,
    MarketingListOut,
    MarketingListUpdate,
    MarketingReportOut,
    MarketingWeekRowOut,
    ProjectClientDeleteRequest,
    ProjectClientOut,
    ProjectClientSaleOut,
    ProjectClientUpdate,
    ProjectMarketingConfigOut,
    ProjectMarketingConfigPatch,
)
from app.services.marketing_clients import client_sales_list, client_to_dict
from app.services.marketing_clients import sync_clients_from_saved_report
from app.services.member_access import user_has_project_sector
from app.services.marketing_lists import (
    create_list,
    delete_list,
    list_week_lists,
    set_list_attachment,
    update_list,
)
from app.services.marketing_report import build_marketing_period_report
from app.services.marketing_weeks import list_marketing_weeks, set_clients_received
from app.services.project_marketing_config import get_marketing_config, is_marketing_enabled, save_marketing_config
from app.services.storage import download_object, object_filename, upload_marketing_list

router = APIRouter(prefix="/api/projects/{project_id}/marketing", tags=["marketing"])


def _require_marketing_project(db: Session, project_id: int, user: User) -> Project:
    if not user_has_project_access(db, user, project_id):
        raise HTTPException(403, "Sem acesso")
    project = db.get(Project, project_id)
    if not project or not project.is_active:
        raise HTTPException(404, "Projeto não encontrado")
    if not is_marketing_enabled(project):
        raise HTTPException(403, "Marketing não habilitado para este projeto")
    if user.level != UserLevel.admin and not user_has_project_sector(db, user, project_id, "marketing"):
        raise HTTPException(403, "Sem acesso ao marketing neste projeto")
    return project


@router.get("/config", response_model=ProjectMarketingConfigOut)
def get_marketing_config_endpoint(
    project_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if not user_has_project_access(db, user, project_id):
        raise HTTPException(403, "Sem acesso")
    project = db.get(Project, project_id)
    if not project:
        raise HTTPException(404, "Projeto não encontrado")
    return ProjectMarketingConfigOut(**get_marketing_config(project))


@router.patch("/config", response_model=ProjectMarketingConfigOut)
def patch_marketing_config(
    project_id: int,
    body: ProjectMarketingConfigPatch,
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    project = db.get(Project, project_id)
    if not project:
        raise HTTPException(404, "Projeto não encontrado")
    config = save_marketing_config(project, body.model_dump(exclude_unset=True))
    db.commit()
    db.refresh(project)
    return ProjectMarketingConfigOut(**config)


@router.get("/weeks", response_model=list[MarketingWeekRowOut])
def get_marketing_weeks(
    project_id: int,
    expense_mode: str = Query("marketing", pattern="^(marketing|all)$"),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    project = _require_marketing_project(db, project_id, user)
    rows = list_marketing_weeks(db, project, expense_mode=expense_mode)
    return [MarketingWeekRowOut(**row) for row in rows]


@router.get("/report", response_model=MarketingReportOut)
def get_marketing_report(
    project_id: int,
    period_start: str = Query(...),
    period_end: str = Query(...),
    expense_mode: str = Query("marketing", pattern="^(marketing|all)$"),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    project = _require_marketing_project(db, project_id, user)
    ps = date.fromisoformat(period_start)
    pe = date.fromisoformat(period_end)
    data = build_marketing_period_report(db, project, ps, pe, expense_mode=expense_mode)
    return MarketingReportOut(**data)


@router.patch("/weeks/clients-received")
def patch_clients_received(
    project_id: int,
    body: MarketingClientsReceivedPatch,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    project = _require_marketing_project(db, project_id, user)
    ps = date.fromisoformat(body.period_start)
    pe = date.fromisoformat(body.period_end)
    result = set_clients_received(db, project.id, ps, pe, body.clients_received, user)
    return result


@router.get("/weeks/lists", response_model=list[MarketingListOut])
def get_week_lists(
    project_id: int,
    period_start: str = Query(...),
    period_end: str = Query(...),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    project = _require_marketing_project(db, project_id, user)
    ps = date.fromisoformat(period_start)
    pe = date.fromisoformat(period_end)
    return [MarketingListOut(**row) for row in list_week_lists(db, project.id, ps, pe)]


@router.post("/weeks/lists", response_model=MarketingListOut, status_code=201)
def post_week_list(
    project_id: int,
    body: MarketingListCreate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    project = _require_marketing_project(db, project_id, user)
    ps = date.fromisoformat(body.period_start)
    pe = date.fromisoformat(body.period_end)
    row = create_list(
        db,
        project,
        ps,
        pe,
        body.model_dump(exclude={"period_start", "period_end"}),
    )
    return MarketingListOut(**row)


@router.patch("/lists/{list_id}", response_model=MarketingListOut)
def patch_list(
    project_id: int,
    list_id: int,
    body: MarketingListUpdate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    _require_marketing_project(db, project_id, user)
    row = update_list(db, project_id, list_id, body.model_dump(exclude_unset=True))
    return MarketingListOut(**row)


@router.delete("/lists/{list_id}", status_code=204)
def remove_list(
    project_id: int,
    list_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    _require_marketing_project(db, project_id, user)
    delete_list(db, project_id, list_id)


@router.post("/lists/{list_id}/attachment", response_model=MarketingListOut)
async def upload_list_attachment(
    project_id: int,
    list_id: int,
    file: UploadFile = File(...),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    _require_marketing_project(db, project_id, user)
    key = await upload_marketing_list(project_id, list_id, file)
    row = set_list_attachment(db, project_id, list_id, key)
    return MarketingListOut(**row)


@router.get("/lists/{list_id}/attachment/download")
def download_list_attachment(
    project_id: int,
    list_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    from fastapi.responses import Response

    from app.models import MarketingDispatch, MarketingList

    _require_marketing_project(db, project_id, user)
    lst = (
        db.query(MarketingList)
        .join(MarketingDispatch)
        .filter(MarketingList.id == list_id, MarketingDispatch.project_id == project_id)
        .first()
    )
    if not lst or not lst.attachment_object_key:
        raise HTTPException(404, "Anexo não encontrado")
    try:
        body_bytes, content_type = download_object(lst.attachment_object_key)
    except Exception as exc:
        raise HTTPException(404, "Arquivo não encontrado") from exc
    filename = object_filename(lst.attachment_object_key)
    return Response(
        content=body_bytes,
        media_type=content_type,
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get("/clients", response_model=list[ProjectClientOut])
def list_marketing_clients(
    project_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    _require_marketing_project(db, project_id, user)
    rows = (
        db.query(ProjectClient)
        .filter(ProjectClient.project_id == project_id)
        .order_by(ProjectClient.registered_at.desc().nullslast(), ProjectClient.id.desc())
        .all()
    )
    return [ProjectClientOut(**client_to_dict(db, row)) for row in rows]


@router.put("/clients/{client_id}", response_model=ProjectClientOut)
def update_marketing_client(
    project_id: int,
    client_id: int,
    body: ProjectClientUpdate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    _require_marketing_project(db, project_id, user)
    client = db.get(ProjectClient, client_id)
    if not client or client.project_id != project_id:
        raise HTTPException(404, "Cliente não encontrado")
    data = body.model_dump(exclude_unset=True)
    if "opening_date" in data and data["opening_date"]:
        data["opening_date"] = date.fromisoformat(data["opening_date"])
    elif "opening_date" in data:
        data["opening_date"] = None
    for field, val in data.items():
        setattr(client, field, val)
    db.commit()
    db.refresh(client)
    return ProjectClientOut(**client_to_dict(db, client))


@router.post("/clients/{client_id}/delete", status_code=204)
def delete_marketing_client(
    project_id: int,
    client_id: int,
    body: ProjectClientDeleteRequest,
    _: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    from app.services.cash_closing import verify_admin_password

    project = db.get(Project, project_id)
    if not project or not project.is_active:
        raise HTTPException(404, "Projeto não encontrado")
    verify_admin_password(db, body.admin_password)
    client = db.get(ProjectClient, client_id)
    if not client or client.project_id != project_id:
        raise HTTPException(404, "Cliente não encontrado")
    db.delete(client)
    db.commit()


@router.get("/clients/{client_id}/sales", response_model=list[ProjectClientSaleOut])
def list_client_sales(
    project_id: int,
    client_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    _require_marketing_project(db, project_id, user)
    client = db.get(ProjectClient, client_id)
    if not client or client.project_id != project_id:
        raise HTTPException(404, "Cliente não encontrado")
    return [ProjectClientSaleOut(**row) for row in client_sales_list(db, client)]


@router.post("/clients/sync", response_model=list[ProjectClientOut])
def sync_marketing_clients(
    project_id: int,
    period_start: str = Query(...),
    period_end: str = Query(...),
    _: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    project = db.get(Project, project_id)
    if not project or not project.is_active:
        raise HTTPException(404, "Projeto não encontrado")
    ps = date.fromisoformat(period_start)
    pe = date.fromisoformat(period_end)
    sync_clients_from_saved_report(db, project_id, ps, pe)
    db.commit()
    rows = (
        db.query(ProjectClient)
        .filter(ProjectClient.project_id == project_id)
        .order_by(ProjectClient.registered_at.desc().nullslast(), ProjectClient.id.desc())
        .all()
    )
    return [ProjectClientOut(**client_to_dict(db, row)) for row in rows]
