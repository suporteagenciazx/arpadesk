#!/usr/bin/env bash
# Restaura backup gerado por backup-local.ps1 na VPS
# Uso:
#   export BACKUP_DIR=/srv/arpadesk-staging/backups/migracao_20260620_1200
#   ./scripts/restore-on-vps.sh

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

: "${BACKUP_DIR:?Defina BACKUP_DIR com a pasta do backup}"

ENV_FILE="${ENV_FILE:-.env}"
COMPOSE=(docker compose --env-file "$ENV_FILE")

if [[ ! -f "$BACKUP_DIR/postgres.sql" ]]; then
  echo "Erro: $BACKUP_DIR/postgres.sql nao encontrado"
  exit 1
fi

echo "==> Backup: $BACKUP_DIR"
echo "==> Subindo postgres..."
"${COMPOSE[@]}" up -d postgres

echo "==> Aguardando postgres healthy..."
for i in $(seq 1 30); do
  if "${COMPOSE[@]}" exec -T postgres pg_isready -U arpadesk >/dev/null 2>&1; then
    break
  fi
  sleep 2
done

POSTGRES_DB=$(grep '^POSTGRES_DB=' "$ENV_FILE" | cut -d= -f2-)
POSTGRES_USER=$(grep '^POSTGRES_USER=' "$ENV_FILE" | cut -d= -f2-)

echo "==> Restaurando PostgreSQL ($POSTGRES_DB)..."
cat "$BACKUP_DIR/postgres.sql" | "${COMPOSE[@]}" exec -T postgres \
  psql -U "$POSTGRES_USER" -d "$POSTGRES_DB"

if [[ -f "$BACKUP_DIR/minio_data.tar.gz" ]]; then
  echo "==> Restaurando MinIO..."
  "${COMPOSE[@]}" up -d minio
  "${COMPOSE[@]}" stop minio

  MINIO_VOL=$("${COMPOSE[@]}" config --format json 2>/dev/null | \
    python3 -c "import json,sys; d=json.load(sys.stdin); print([v['name'] for v in d.get('volumes',{}).values() if 'minio' in v.get('name','')][0])" 2>/dev/null || true)

  if [[ -z "${MINIO_VOL:-}" ]]; then
    MINIO_VOL=$(docker volume ls -q | grep minio_data | head -1)
  fi

  if [[ -z "${MINIO_VOL:-}" ]]; then
    echo "Aviso: volume minio_data nao encontrado; suba minio uma vez e rode de novo"
  else
    docker run --rm \
      -v "${MINIO_VOL}:/data" \
      -v "${BACKUP_DIR}:/backup:ro" \
      alpine sh -c "rm -rf /data/* && tar xzf /backup/minio_data.tar.gz -C /data"
    echo "MinIO restaurado em volume: $MINIO_VOL"
  fi
fi

if [[ -f "$BACKUP_DIR/uploads_data.tar.gz" ]]; then
  echo "==> Restaurando uploads legado..."
  UPLOADS_VOL=$(docker volume ls -q | grep uploads_data | head -1)
  if [[ -n "${UPLOADS_VOL:-}" ]]; then
    docker run --rm \
      -v "${UPLOADS_VOL}:/data" \
      -v "${BACKUP_DIR}:/backup:ro" \
      alpine sh -c "mkdir -p /data && tar xzf /backup/uploads_data.tar.gz -C /data --strip-components=1"
  fi
fi

echo ""
echo "Restore concluido. Suba a stack completa:"
echo "  docker compose --env-file .env up -d --build"
