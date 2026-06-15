# 04 — Manutenção e backup

Procedimentos para manter o Arpadesk saudável na VPS.

## Backup PostgreSQL

### Backup manual

```bash
cd /srv/arpadesk-prod   # ou staging

docker compose exec -T postgres pg_dump \
  -U "$POSTGRES_USER" \
  -d "$POSTGRES_DB" \
  --no-owner --clean --if-exists \
  > backup_$(date +%Y%m%d_%H%M).sql
```

Restaurar (cuidado — sobrescreve dados):

```bash
cat backup_20260614_1200.sql | docker compose exec -T postgres \
  psql -U "$POSTGRES_USER" -d "$POSTGRES_DB"
```

### Backup automático (cron)

```bash
sudo crontab -e
```

Adicione (exemplo: todo dia às 3h):

```cron
0 3 * * * cd /srv/arpadesk-prod && docker compose exec -T postgres pg_dump -U arpadesk -d arpadesk_prod --no-owner > /backups/arpadesk/pg_$(date +\%Y\%m\%d).sql 2>> /var/log/arpadesk-backup.log
```

Crie a pasta de destino:

```bash
sudo mkdir -p /backups/arpadesk
sudo chown $USER:$USER /backups/arpadesk
```

Rotacionar backups antigos (manter 14 dias):

```bash
find /backups/arpadesk -name "pg_*.sql" -mtime +14 -delete
```

## Backup volume de uploads

Comprovantes e anexos ficam no volume `uploads_data`.

```bash
docker run --rm \
  -v arpadesk-prod_uploads_data:/data:ro \
  -v /backups/arpadesk:/backup \
  alpine tar czf /backup/uploads_$(date +%Y%m%d).tar.gz -C /data .
```

> Ajuste o nome do volume: `docker volume ls | grep uploads`

## Backup de secrets offline

Anote e guarde **fora da VPS**:

| Secret | Consequência se perder |
|--------|------------------------|
| `VAULT_MASTER_KEY` | Credenciais do módulo Suporte irrecuperáveis |
| `JWT_SECRET_KEY` | Todos os tokens invalidados (usuários relogam) |
| `POSTGRES_PASSWORD` | Precisa reset manual no banco |

## Updates do sistema

### Atualizar código

```bash
cd /srv/arpadesk-prod
git pull
docker compose --env-file .env build
docker compose --env-file .env up -d
docker compose ps
```

### Migrations (quando Alembic estiver ativo)

```bash
docker compose exec backend alembic upgrade head
```

### Atualizar imagens base

```bash
docker compose pull
docker compose up -d
```

### Limpeza de imagens antigas

```bash
docker image prune -f
```

## Monitoramento básico

```bash
# Espaço em disco
df -h

# Uso Docker
docker system df

# Containers parados
docker compose ps -a

# Health
curl -s https://seudominio.com.br/api/health
```

## Recuperação de desastre

1. Restaurar `.env` a partir de backup seguro offline
2. Subir stack: `docker compose up -d --build`
3. Restaurar SQL: ver seção backup manual
4. Restaurar uploads: extrair tar no volume
5. Validar checklist em [03-deploy-vps.md](./03-deploy-vps.md)

## Manutenção do Portainer

- Atualize o Portainer periodicamente seguindo a documentação oficial
- Restrinja acesso à porta 9443 ao seu IP se possível:

```bash
sudo ufw delete allow 9443/tcp
sudo ufw allow from SEU_IP to any port 9443
```
