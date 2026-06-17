from __future__ import annotations

import uuid
from pathlib import Path

import boto3
from botocore.client import Config
from botocore.exceptions import ClientError
from fastapi import HTTPException, UploadFile

from app.config import settings

ALLOWED_CP_CONTENT_TYPES = {
    "application/pdf": ".pdf",
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
}
MAX_CP_BYTES = 10 * 1024 * 1024


class StorageError(Exception):
    pass


def storage_enabled() -> bool:
    return bool(settings.s3_endpoint and settings.s3_bucket)


def _client():
    if not storage_enabled():
        raise StorageError("Armazenamento S3/MinIO não configurado")
    return boto3.client(
        "s3",
        endpoint_url=settings.s3_endpoint,
        aws_access_key_id=settings.s3_access_key,
        aws_secret_access_key=settings.s3_secret_key,
        region_name=settings.s3_region,
        config=Config(signature_version="s3v4"),
        use_ssl=settings.s3_use_ssl,
    )


def ensure_bucket() -> None:
    if not storage_enabled():
        return
    client = _client()
    bucket = settings.s3_bucket
    try:
        client.head_bucket(Bucket=bucket)
    except ClientError:
        client.create_bucket(Bucket=bucket)


def sale_cp_object_key(project_id: int, sale_id: int, extension: str) -> str:
    ext = extension if extension.startswith(".") else f".{extension}"
    return f"projects/{project_id}/sales/{sale_id}/{uuid.uuid4().hex}{ext}"


def report_pdf_object_key(project_id: int, period_start: str, period_end: str) -> str:
    return f"projects/{project_id}/reports/{period_start}_{period_end}/{uuid.uuid4().hex}.pdf"


def report_staging_object_key(project_id: int, staging_id: str) -> str:
    return f"projects/{project_id}/reports/staging/{staging_id}.pdf"


def _resolve_extension(upload: UploadFile) -> str:
    content_type = (upload.content_type or "").split(";")[0].strip().lower()
    if content_type in ALLOWED_CP_CONTENT_TYPES:
        return ALLOWED_CP_CONTENT_TYPES[content_type]
    filename = (upload.filename or "").lower()
    for ext in (".pdf", ".jpg", ".jpeg", ".png", ".webp"):
        if filename.endswith(ext):
            return ".jpg" if ext == ".jpeg" else ext
    raise HTTPException(400, "Tipo de arquivo não permitido. Use PDF, JPG, PNG ou WEBP.")


async def read_upload_limited(upload: UploadFile, max_bytes: int = MAX_CP_BYTES) -> bytes:
    data = await upload.read()
    if len(data) > max_bytes:
        raise HTTPException(400, f"Arquivo excede o limite de {max_bytes // (1024 * 1024)} MB.")
    if not data:
        raise HTTPException(400, "Arquivo vazio.")
    return data


async def upload_sale_cp(project_id: int, sale_id: int, upload: UploadFile) -> str:
    extension = _resolve_extension(upload)
    data = await read_upload_limited(upload)
    key = sale_cp_object_key(project_id, sale_id, extension)
    content_type = (upload.content_type or "application/octet-stream").split(";")[0].strip()
    client = _client()
    client.put_object(
        Bucket=settings.s3_bucket,
        Key=key,
        Body=data,
        ContentType=content_type,
    )
    return key


async def upload_report_pdf_bytes(project_id: int, key: str, data: bytes) -> str:
    client = _client()
    client.put_object(
        Bucket=settings.s3_bucket,
        Key=key,
        Body=data,
        ContentType="application/pdf",
    )
    return key


async def upload_report_pdf(project_id: int, period_start: str, period_end: str, upload: UploadFile) -> str:
    content_type = (upload.content_type or "").split(";")[0].strip().lower()
    filename = (upload.filename or "").lower()
    if content_type != "application/pdf" and not filename.endswith(".pdf"):
        raise HTTPException(400, "Envie um arquivo PDF.")
    data = await read_upload_limited(upload, max_bytes=15 * 1024 * 1024)
    key = report_pdf_object_key(project_id, period_start, period_end)
    return await upload_report_pdf_bytes(project_id, key, data)


def download_object(key: str) -> tuple[bytes, str]:
    client = _client()
    try:
        obj = client.get_object(Bucket=settings.s3_bucket, Key=key)
    except ClientError as exc:
        raise StorageError("Arquivo não encontrado no armazenamento") from exc
    body = obj["Body"].read()
    content_type = obj.get("ContentType") or "application/octet-stream"
    return body, content_type


def presigned_get_url(key: str, expires: int | None = None) -> str:
    client = _client()
    url = client.generate_presigned_url(
        "get_object",
        Params={"Bucket": settings.s3_bucket, "Key": key},
        ExpiresIn=expires or settings.s3_presign_expires,
    )
    public = (settings.s3_public_endpoint or "").strip().rstrip("/")
    internal = (settings.s3_endpoint or "").strip().rstrip("/")
    if public and internal and internal in url:
        url = url.replace(internal, public, 1)
    return url


def delete_object(key: str | None) -> None:
    if not key or not storage_enabled():
        return
    client = _client()
    try:
        client.delete_object(Bucket=settings.s3_bucket, Key=key)
    except ClientError:
        pass


def object_filename(key: str) -> str:
    return Path(key).name
