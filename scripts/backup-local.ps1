# Backup Arpadesk local (Windows) para migração VPS
# Uso: powershell -ExecutionPolicy Bypass -File .\scripts\backup-local.ps1

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
Set-Location $Root

$Timestamp = Get-Date -Format "yyyyMMdd_HHmm"
$OutDir = Join-Path $Root "backups\migracao_$Timestamp"
New-Item -ItemType Directory -Force -Path $OutDir | Out-Null

Write-Host "==> Backup em $OutDir"

# PostgreSQL
Write-Host "==> PostgreSQL dump..."
docker compose -f docker-compose.dev.yml exec -T postgres pg_dump `
  -U arpadesk -d arpadesk_dev `
  --no-owner --clean --if-exists `
  | Out-File -FilePath (Join-Path $OutDir "postgres.sql") -Encoding utf8

# MinIO volume
Write-Host "==> MinIO volume..."
$MinioVol = (docker volume ls -q | Select-String "minio_dev_data" | Select-Object -First 1).ToString().Trim()
if (-not $MinioVol) {
  Write-Warning "Volume minio_dev_data nao encontrado. Liste com: docker volume ls"
  exit 1
}
docker run --rm `
  -v "${MinioVol}:/data:ro" `
  -v "${OutDir}:/backup" `
  alpine tar czf /backup/minio_data.tar.gz -C /data .

# Uploads legado
$UploadsPath = Join-Path $Root "data\uploads"
if (Test-Path $UploadsPath) {
  Write-Host "==> Uploads legado..."
  tar -czf (Join-Path $OutDir "uploads_data.tar.gz") -C (Join-Path $Root "data") uploads
}

# Secrets para copiar manualmente ao .env da VPS (nao commitar esta pasta)
$EnvFile = Join-Path $Root ".env"
if (Test-Path $EnvFile) {
  Write-Host "==> env-secrets-local.txt (VAULT + S3)..."
  $lines = Get-Content $EnvFile | Where-Object {
    $_ -match '^(VAULT_MASTER_KEY|S3_ACCESS_KEY|S3_SECRET_KEY|S3_BUCKET)='
  }
  $lines | Out-File (Join-Path $OutDir "env-secrets-local.txt") -Encoding utf8
}

Write-Host ""
Write-Host "Concluido. Envie a pasta para a VPS:"
Write-Host "  scp -r backups\migracao_$Timestamp USUARIO@IP_VPS:/srv/arpadesk-staging/backups/"
Write-Host ""
Write-Host "Arquivos:"
Get-ChildItem $OutDir | Format-Table Name, Length
