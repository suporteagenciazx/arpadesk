# 07 — Migração local → VPS (dados de teste)

Guia para levar **o mesmo estado** do seu PC (projeto AGENCIA, vendas, relatórios salvos, semana aberta, comprovantes MinIO) para a VPS com Docker + Portainer.

> Deploy da stack em si: [03-deploy-vps.md](./03-deploy-vps.md)  
> Variáveis de ambiente: [05-variaveis-ambiente.md](./05-variaveis-ambiente.md)

---

## O que será migrado

| Dado | Onde fica localmente | Como migrar |
|------|----------------------|-------------|
| **Banco PostgreSQL** | volume `pg_dev_data` | `pg_dump` → `psql` na VPS |
| **Comprovantes (CP)** | volume `minio_dev_data` | tar do volume → extrair no volume `minio_data` |
| **Cache Redis** | volume `redis_dev_data` | **não migrar** — recria sozinho (TTL 120s) |
| **Uploads legado** | pasta `./data/uploads` | tar + copiar para volume `uploads_data` (se houver arquivos) |
| **Semana aberta / caixa** | coluna `projects.settings` → `finance_config.active_period` | vem no dump PostgreSQL |
| **Fechamentos de caixa** | tabela `cash_closings` | vem no dump |
| **Relatórios importados** | MinIO + `report_import_logs` | dump + volume MinIO |
| **Credenciais Suporte (cofre)** | criptografadas com `VAULT_MASTER_KEY` | dump + **mesma** `VAULT_MASTER_KEY` na VPS |

---

## Chaves que DEVEM coincidir (ou adaptar)

| Variável | Migrar igual ao local? | Se mudar na VPS |
|----------|------------------------|-----------------|
| `VAULT_MASTER_KEY` | **Sim** (se usa módulo Suporte) | Credenciais do cofre ficam ilegíveis |
| `S3_ACCESS_KEY` / `S3_SECRET_KEY` | **Recomendado sim** na 1ª migração | Restaurar volume MinIO com credenciais diferentes pode falhar — use as mesmas ou reenvie CPs |
| `S3_BUCKET` | Sim (`arpadesk`) | Objetos em bucket errado |
| `JWT_SECRET_KEY` | Pode ser nova (mais seguro) | Todos precisam fazer login de novo |
| `POSTGRES_PASSWORD` | Pode ser nova na VPS | Ajustar `DATABASE_URL` no `.env` — o dump não depende da senha antiga |
| `SEEDED_ADMIN_*` | Ignorado após restore | Admin já existe no dump |

---

## Visão geral (ordem)

```
[PC Windows]                    [VPS Linux]
     │                               │
     ├─ 1. backup-local.ps1          │
     ├─ 2. scp backups/ ────────────►│
     │                               ├─ 3. git clone + .env
     │                               ├─ 4. docker compose up -d postgres
     │                               ├─ 5. restore-on-vps.sh
     │                               ├─ 6. docker compose up -d --build
     │                               └─ 7. checklist pós-migração
```

---

## Fase 1 — Backup no Windows (PC local)

### 1.1 Confirmar que a stack local está rodando

```powershell
cd c:\xampp\htdocs\arpadesk
docker compose -f docker-compose.dev.yml ps
```

Todos os serviços devem estar `running` (postgres, minio, redis, backend, frontend).

### 1.2 Executar script de backup (recomendado)

```powershell
cd c:\xampp\htdocs\arpadesk
powershell -ExecutionPolicy Bypass -File .\scripts\backup-local.ps1
```

Saída em `backups/migracao_YYYYMMDD_HHMM/`:

| Arquivo | Conteúdo |
|---------|----------|
| `postgres.sql` | Dump completo do banco |
| `minio_data.tar.gz` | Objetos do bucket (comprovantes, PDFs) |
| `uploads_data.tar.gz` | Uploads legados (se existirem) |
| `env-secrets-local.txt` | **Somente** `VAULT_MASTER_KEY` e `S3_*` — guarde com cuidado, não commite |

### 1.3 Backup manual (alternativa)

**PostgreSQL:**

```powershell
cd c:\xampp\htdocs\arpadesk
mkdir backups\migracao_manual -Force

docker compose -f docker-compose.dev.yml exec -T postgres pg_dump `
  -U arpadesk -d arpadesk_dev `
  --no-owner --clean --if-exists `
  > backups\migracao_manual\postgres.sql
```

**MinIO** — descubra o nome exato do volume:

```powershell
docker volume ls | findstr minio
# Exemplo: arpadesk_minio_dev_data

docker run --rm `
  -v arpadesk_minio_dev_data:/data:ro `
  -v ${PWD}/backups/migracao_manual:/backup `
  alpine tar czf /backup/minio_data.tar.gz -C /data .
```

**Uploads legado** (opcional):

```powershell
if (Test-Path .\data\uploads) {
  tar -czf backups\migracao_manual\uploads_data.tar.gz -C data uploads
}
```

### 1.4 Anotar estado de referência (opcional, para validar na VPS)

```powershell
docker compose -f docker-compose.dev.yml exec -T postgres psql -U arpadesk -d arpadesk_dev -c `
  "SELECT slug, settings->'finance_config'->'active_period' AS semana_aberta FROM projects WHERE slug='agencia';"
```

Exemplo esperado após testes locais (jun/2026):

- Relatório salvo: **15–19/06/2026**
- Semana aberta (Atual admin): **22–26/06/2026** (Semana 26/2026)

---

## Fase 2 — Enviar backups para a VPS

Substitua `USUARIO`, `IP_VPS` e o caminho do backup.

**PowerShell (OpenSSH no Windows):**

```powershell
scp -r backups\migracao_20260620_1200 USUARIO@IP_VPS:/srv/arpadesk-staging/backups/
```

**Ou WinSCP / FileZilla:** envie a pasta para `/srv/arpadesk-staging/backups/`.

---

## Fase 3 — Preparar VPS (primeira vez)

Siga [03-deploy-vps.md](./03-deploy-vps.md) até ter Docker, firewall e pasta do projeto.

```bash
sudo mkdir -p /srv/arpadesk-staging/backups
sudo chown -R $USER:$USER /srv/arpadesk-staging
cd /srv/arpadesk-staging

git clone https://github.com/suporteagenciazx/arpadesk.git .
cp .env.example .env
nano .env
chmod 600 .env
```

### 3.1 `.env` na VPS com dados migrados

Use secrets **fortes** para JWT e Postgres, mas **copie do PC local**:

- `VAULT_MASTER_KEY` — igual ao local (cofre Suporte)
- `S3_ACCESS_KEY` e `S3_SECRET_KEY` — iguais ao local (MinIO restaurado)
- `S3_BUCKET=arpadesk`

Exemplo (ajuste domínio e senhas):

```env
ENVIRONMENT=production
DOMAIN=arpadesk-staging.seudominio.com.br

POSTGRES_USER=arpadesk
POSTGRES_PASSWORD=SENHA_FORTE_NOVA
POSTGRES_DB=arpadesk_staging
DATABASE_URL=postgresql+psycopg2://arpadesk:SENHA_FORTE_NOVA@postgres:5432/arpadesk_staging

JWT_SECRET_KEY=GERAR_COM_openssl_rand_-hex_32
JWT_EXPIRES_MINUTES=480
VAULT_MASTER_KEY=COPIAR_DO_ENV_LOCAL

CORS_ORIGINS=https://arpadesk-staging.seudominio.com.br

S3_ENDPOINT=http://minio:9000
S3_ACCESS_KEY=arpadesk
S3_SECRET_KEY=arpadesksecret
S3_BUCKET=arpadesk
S3_REGION=us-east-1
S3_USE_SSL=false
S3_PRESIGN_EXPIRES=3600
S3_PUBLIC_ENDPOINT=

REDIS_URL=redis://redis:6379/0
REDIS_CACHE_TTL=120

SEEDED_ADMIN_EMAIL=admin@arpadesk.local
SEEDED_ADMIN_PASSWORD=nao_usado_apos_restore
SEEDED_ADMIN_NAME=Administrador
```

> `VITE_API_URL` não vai no `.env` da VPS — o build usa `https://${DOMAIN}` no `docker-compose.yml`.

---

## Fase 4 — Restaurar dados na VPS

### 4.1 Subir só o PostgreSQL

```bash
cd /srv/arpadesk-staging
docker compose --env-file .env up -d postgres

# Aguardar healthy
docker compose ps postgres
```

### 4.2 Restaurar banco

Substitua `BACKUP_DIR` pelo nome da pasta enviada:

```bash
export BACKUP_DIR=/srv/arpadesk-staging/backups/migracao_20260620_1200

cat "$BACKUP_DIR/postgres.sql" | docker compose --env-file .env exec -T postgres \
  psql -U arpadesk -d arpadesk_staging
```

Erros do tipo `does not exist` no início do restore (DROP) são normais com `--clean`.

### 4.3 Restaurar MinIO (com stack parada ou só minio parado)

```bash
# Descobrir nome do volume (após primeiro up parcial ou compose config)
docker volume ls | grep minio

# Criar volume se ainda não existir
docker compose --env-file .env up -d minio
docker compose --env-file .env stop minio

# Restaurar (ajuste nome do volume: arpadesk-staging_minio_data ou similar)
docker run --rm \
  -v arpadesk-staging_minio_data:/data \
  -v "$BACKUP_DIR":/backup:ro \
  alpine sh -c "rm -rf /data/* && tar xzf /backup/minio_data.tar.gz -C /data"
```

### 4.4 Restaurar uploads legado (se existir tar)

```bash
docker compose --env-file .env up -d backend
docker compose --env-file .env stop backend

docker run --rm \
  -v arpadesk-staging_uploads_data:/data \
  -v "$BACKUP_DIR":/backup:ro \
  alpine sh -c "tar xzf /backup/uploads_data.tar.gz -C /data --strip-components=1"
```

### 4.5 Script automatizado (alternativa)

```bash
cd /srv/arpadesk-staging
chmod +x scripts/restore-on-vps.sh

export BACKUP_DIR=/srv/arpadesk-staging/backups/migracao_20260620_1200
export COMPOSE_PROJECT_NAME=arpadesk-staging   # opcional, se usar nome fixo

./scripts/restore-on-vps.sh
```

---

## Fase 5 — Subir stack completa

```bash
cd /srv/arpadesk-staging
docker compose --env-file .env up -d --build
docker compose ps
docker compose logs -f backend
```

Aguarde o Caddy obter certificado Let's Encrypt (1–2 min).

---

## Fase 6 — Deploy via Portainer (mesmos dados)

Se preferir gerenciar pela UI:

1. Faça as fases 1–5 via SSH **uma vez** (build + restore).
2. A stack aparece em **Portainer → Stacks**.
3. Próximos redeploys: **Stacks → arpadesk-staging → Pull and redeploy** ou `git pull` + `docker compose up -d --build` via SSH.

**Não** restaure dump pelo Portainer sem ter o `.env` e volumes corretos no host — o restore é sempre via SSH nos volumes.

---

## Checklist pós-migração

### Infra

- [ ] `curl -s https://SEU_DOMINIO/api/health` → JSON ok
- [ ] HTTPS sem aviso de certificado
- [ ] Portas 5432, 6379, 9000 **não** expostas publicamente (`ss -tlnp | grep -E '5432|6379|9000'` na VPS deve mostrar só localhost ou nada)

### Dados AGENCIA

- [ ] Login com usuário existente (não o seed — admin já veio no dump)
- [ ] Projeto **AGENCIA** visível com vendas/despesas
- [ ] Admin: preset **Atual** = mesma semana aberta do PC (ex.: 22–26/06/2026)
- [ ] Equipe: overlay **CAIXA FECHADO** se ainda antes da segunda da semana vigente
- [ ] Aba **Arquivo**: relatório 15–19/06 salvo; ícone ↩ restaurar vigência (admin)
- [ ] Download de comprovante de venda abre arquivo (MinIO ok)
- [ ] Relatório semanal / import PDF funciona

### Comandos de verificação na VPS

```bash
# Semana aberta do projeto agencia
docker compose exec -T postgres psql -U arpadesk -d arpadesk_staging -c \
  "SELECT slug, settings->'finance_config'->'active_period' FROM projects WHERE slug='agencia';"

# API active-period (com token admin)
curl -s -H "Authorization: Bearer SEU_TOKEN" \
  "https://SEU_DOMINIO/api/projects/1/active-period"

# Objetos no MinIO (dentro do container)
docker compose exec minio mc alias set local http://localhost:9000 arpadesk arpadesksecret
docker compose exec minio mc ls local/arpadesk --recursive | head
```

---

## Atualizar código depois (sem perder dados)

```bash
cd /srv/arpadesk-staging
git pull
docker compose --env-file .env build
docker compose --env-file .env up -d
```

Volumes `pg_data`, `minio_data`, `uploads_data` **persistem** entre rebuilds.

Backup antes de updates grandes: [04-manutencao-backup.md](./04-manutencao-backup.md).

---

## Problemas comuns

| Sintoma | Causa provável | Solução |
|---------|----------------|---------|
| Cofre Suporte vazio / erro ao abrir | `VAULT_MASTER_KEY` diferente do local | Refazer restore com chave correta ou manter chave local no `.env` |
| CP 404 ao baixar | MinIO não restaurado ou `S3_*` errado | Restaurar tar MinIO; conferir credenciais |
| Admin duplicado / seed estranho | Restore após backend já ter seedado | Restaurar dump **antes** do primeiro `up` completo do backend |
| Semana Atual errada | Dump antigo ou timezone VPS | `timedatectl set-timezone America/Sao_Paulo`; conferir `active_period` no banco |
| CORS error no browser | `CORS_ORIGINS` sem `https://` do domínio | Ajustar `.env` e `docker compose restart backend` |
| Frontend chama API errada | Build antigo | `docker compose build frontend --no-cache && docker compose up -d frontend` |

---

## Referência rápida — volumes Docker

| Ambiente | Prefixo típico do volume | Nomes |
|----------|--------------------------|-------|
| Local dev | `arpadesk_` | `pg_dev_data`, `minio_dev_data`, `redis_dev_data` |
| VPS staging | `arpadesk-staging_` ou pasta do projeto | `pg_data`, `minio_data`, `uploads_data` |

Liste sempre com:

```bash
docker volume ls | grep -E 'pg|minio|upload'
```
