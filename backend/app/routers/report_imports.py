import uuid
from datetime import date

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile
from sqlalchemy.orm import Session, joinedload

from app.database import get_db
from app.dependencies import require_admin_finance, user_has_project_access
from app.models import ReportImport, ReportImportLog, User
from app.schemas import ReportImportLogOut, ReportImportOut, ReportImportParseOut
from app.services.cache import cache_delete_prefix
from app.services.report_import import append_import_log, build_import_preview, commit_report_import
from app.services.report_pdf import extract_report_from_pdf
from app.services.storage import (
    StorageError,
    delete_object,
    download_object,
    report_pdf_object_key,
    report_staging_object_key,
    storage_enabled,
    upload_report_pdf_bytes,
)

router = APIRouter(prefix="/api/projects/{project_id}/report-imports", tags=["report-imports"])


def _out(row: ReportImport) -> ReportImportOut:
    return ReportImportOut(
        id=row.id,
        project_id=row.project_id,
        period_start=row.period_start,
        period_end=row.period_end,
        original_filename=row.original_filename,
        extracted_data=row.extracted_data or {},
        created_at=row.created_at,
    )


def _log_out(row: ReportImportLog) -> ReportImportLogOut:
    return ReportImportLogOut(
        id=row.id,
        period_start=row.period_start,
        period_end=row.period_end,
        original_filename=row.original_filename,
        saved_at=row.saved_at,
        created_by_name=row.created_by.name if row.created_by else None,
    )


@router.get("/logs", response_model=list[ReportImportLogOut])
def list_report_import_logs(
    project_id: int,
    period_start: str = Query(...),
    period_end: str = Query(...),
    user: User = Depends(require_admin_finance),
    db: Session = Depends(get_db),
):
    if not user_has_project_access(db, user, project_id):
        raise HTTPException(403, "Sem acesso")
    ps = date.fromisoformat(period_start)
    pe = date.fromisoformat(period_end)
    rows = (
        db.query(ReportImportLog)
        .options(joinedload(ReportImportLog.created_by))
        .filter(
            ReportImportLog.project_id == project_id,
            ReportImportLog.period_start == ps,
            ReportImportLog.period_end == pe,
        )
        .order_by(ReportImportLog.saved_at.desc())
        .all()
    )
    return [_log_out(r) for r in rows]


@router.get("", response_model=ReportImportOut | None)
def get_report_import(
    project_id: int,
    period_start: str = Query(...),
    period_end: str = Query(...),
    user: User = Depends(require_admin_finance),
    db: Session = Depends(get_db),
):
    if not user_has_project_access(db, user, project_id):
        raise HTTPException(403, "Sem acesso")
    ps = date.fromisoformat(period_start)
    pe = date.fromisoformat(period_end)
    row = (
        db.query(ReportImport)
        .filter(
            ReportImport.project_id == project_id,
            ReportImport.period_start == ps,
            ReportImport.period_end == pe,
        )
        .first()
    )
    return _out(row) if row else None


@router.post("/parse", response_model=ReportImportParseOut)
async def parse_report_pdf(
    project_id: int,
    period_start: str = Form(...),
    period_end: str = Form(...),
    file: UploadFile = File(...),
    user: User = Depends(require_admin_finance),
    db: Session = Depends(get_db),
):
    """Extrai o PDF e retorna pré-visualização sem gravar vendas/despesas/pagamentos."""
    if not user_has_project_access(db, user, project_id):
        raise HTTPException(403, "Sem acesso")
    if not storage_enabled():
        raise HTTPException(503, "Armazenamento não configurado")

    ps = date.fromisoformat(period_start)
    pe = date.fromisoformat(period_end)
    if pe < ps:
        raise HTTPException(400, "Data final deve ser igual ou posterior à inicial")

    content_type = (file.content_type or "").split(";")[0].strip().lower()
    filename = (file.filename or "").lower()
    if content_type != "application/pdf" and not filename.endswith(".pdf"):
        raise HTTPException(400, "Envie um arquivo PDF.")

    from app.services.storage import read_upload_limited

    try:
        pdf_bytes = await read_upload_limited(file, max_bytes=15 * 1024 * 1024)
        staging_id = uuid.uuid4().hex
        staging_key = report_staging_object_key(project_id, staging_id)
        await upload_report_pdf_bytes(project_id, staging_key, pdf_bytes)
    except StorageError as exc:
        raise HTTPException(503, str(exc)) from exc

    extracted = extract_report_from_pdf(pdf_bytes)
    preview = build_import_preview(db, project_id, extracted, ps, pe)

    return ReportImportParseOut(
        staging_id=staging_id,
        period_start=ps,
        period_end=pe,
        original_filename=file.filename,
        parse_status=extracted.get("parse_status") or "partial",
        extracted_data=extracted,
        preview=preview,
    )


@router.post("/commit", response_model=ReportImportOut, status_code=201)
async def commit_report_pdf(
    project_id: int,
    period_start: str = Form(...),
    period_end: str = Form(...),
    staging_id: str = Form(...),
    original_filename: str = Form(""),
    user: User = Depends(require_admin_finance),
    db: Session = Depends(get_db),
):
    """Confirma e grava a importação no banco (vendas, despesas, pagamentos, comissões do período)."""
    if not user_has_project_access(db, user, project_id):
        raise HTTPException(403, "Sem acesso")
    if not storage_enabled():
        raise HTTPException(503, "Armazenamento não configurado")

    ps = date.fromisoformat(period_start)
    pe = date.fromisoformat(period_end)
    if pe < ps:
        raise HTTPException(400, "Data final deve ser igual ou posterior à inicial")

    staging_key = report_staging_object_key(project_id, staging_id)
    try:
        pdf_bytes, _ = download_object(staging_key)
    except StorageError as exc:
        raise HTTPException(400, "Pré-visualização expirada ou inválida. Importe o PDF novamente.") from exc

    extracted = extract_report_from_pdf(pdf_bytes)
    extracted = commit_report_import(
        db,
        project_id,
        ps,
        pe,
        extracted,
        created_by_id=user.id,
    )

    pdf_key = report_pdf_object_key(project_id, period_start, period_end)
    await upload_report_pdf_bytes(project_id, pdf_key, pdf_bytes)
    delete_object(staging_key)

    existing = (
        db.query(ReportImport)
        .filter(
            ReportImport.project_id == project_id,
            ReportImport.period_start == ps,
            ReportImport.period_end == pe,
        )
        .first()
    )
    if existing:
        delete_object(existing.pdf_object_key)
        existing.pdf_object_key = pdf_key
        existing.original_filename = original_filename or existing.original_filename
        existing.extracted_data = extracted
        existing.created_by_id = user.id
        row = existing
    else:
        row = ReportImport(
            project_id=project_id,
            period_start=ps,
            period_end=pe,
            pdf_object_key=pdf_key,
            original_filename=original_filename or None,
            extracted_data=extracted,
            created_by_id=user.id,
        )
        db.add(row)

    append_import_log(
        db,
        project_id,
        ps,
        pe,
        original_filename=original_filename or None,
        created_by_id=user.id,
    )

    db.commit()
    db.refresh(row)
    cache_delete_prefix(f"report:{project_id}:")
    cache_delete_prefix(f"summary:{project_id}:")
    cache_delete_prefix(f"commissions:{project_id}:")
    return _out(row)
