# 05 — Variáveis de ambiente

Referência das variáveis usadas pelo Arpadesk.

| Template | Ambiente |
|----------|----------|
| `.env.example` | Desenvolvimento local — copiar para `.env` na raiz |
| `.env.vps.example` | VPS staging/prod — copiar para `.env` em `/srv/arpadesk-*` |

> **Nunca** commite o arquivo `.env`. Na VPS use `chmod 600 .env`.

---

## App

| Variável | Obrigatório | Default dev | Descrição |
|----------|-------------|-------------|-----------|
| `ENVIRONMENT` | sim | `development` | `development` ou `production` |
| `DOMAIN` | prod | `localhost` | Domínio público sem `https://` (VPS) |

---

## PostgreSQL

| Variável | Obrigatório | Default dev | Descrição |
|----------|-------------|-------------|-----------|
| `POSTGRES_USER` | sim | `arpadesk` | Usuário do banco |
| `POSTGRES_PASSWORD` | sim | `devpass` | Senha — **forte em prod** |
| `POSTGRES_DB` | sim | `arpadesk_dev` | Nome do database |
| `DATABASE_URL` | sim | ver `.env.example` | URL SQLAlchemy (`postgresql+psycopg2://...`) |

**Local:** host `postgres` (nome do serviço Docker).  
**VPS:** mesma URL com senha forte; Postgres sem porta exposta.

---

## Autenticação (JWT)

| Variável | Obrigatório | Default dev | Descrição |
|----------|-------------|-------------|-----------|
| `JWT_SECRET_KEY` | sim | `dev-only-...` | Segredo HS256 — gerar com `openssl rand -hex 32` em prod |
| `JWT_EXPIRES_MINUTES` | não | `480` | Validade do token (8 h) |

---

## Cofre de credenciais (Suporte)

| Variável | Obrigatório | Default dev | Descrição |
|----------|-------------|-------------|-----------|
| `VAULT_MASTER_KEY` | sim | dev key | Chave AES — `openssl rand -base64 32` em prod; **backup offline** |

---

## CORS e frontend

| Variável | Obrigatório | Default dev | Descrição |
|----------|-------------|-------------|-----------|
| `CORS_ORIGINS` | sim | `http://localhost:5173` | Origens permitidas (CSV ou única URL) |
| `VITE_API_URL` | sim | `http://localhost:8000` | URL base da API para o frontend (build e dev) |

**VPS:** use `https://seudominio.com.br` — sem barra final, sem `/api`.

---

## Uploads / MinIO (comprovantes)

| Variável | Obrigatório | Default dev | Descrição |
|----------|-------------|-------------|-----------|
| `UPLOAD_DIR` | não | `/data/uploads` | Pasta legada no container (não usada para CP) |
| `S3_ENDPOINT` | sim* | `http://minio:9000` | URL interna do MinIO (`minio:9000` no Docker) |
| `S3_ACCESS_KEY` | sim* | `arpadesk` | Usuário root MinIO |
| `S3_SECRET_KEY` | sim* | — | Senha root MinIO — **forte em prod** |
| `S3_BUCKET` | não | `arpadesk` | Bucket dos comprovantes (criado no 1º start) |
| `S3_REGION` | não | `us-east-1` | Região S3 (MinIO aceita qualquer valor) |
| `S3_USE_SSL` | não | `false` | `true` se MinIO com TLS |
| `S3_PRESIGN_EXPIRES` | não | `3600` | Segundos da URL temporária de download |
| `S3_PUBLIC_ENDPOINT` | não | `http://localhost:9000` (dev) | Host público do MinIO para URLs assinadas (VPS: vazio ou proxy) |

\* Obrigatório para upload de CP. Console MinIO local: `http://localhost:9001`

---

## Redis (cache)

| Variável | Obrigatório | Default dev | Descrição |
|----------|-------------|-------------|-----------|
| `REDIS_URL` | não | `redis://redis:6379/0` | Cache de `/summary`, `/report` e `/payments/commissions` |
| `REDIS_CACHE_TTL` | não | `120` | TTL em segundos |

Se `REDIS_URL` estiver vazio, o sistema funciona sem cache.

---

## Seed (primeiro start)

| Variável | Obrigatório | Default dev | Descrição |
|----------|-------------|-------------|-----------|
| `SEEDED_ADMIN_EMAIL` | não | `admin@arpadesk.local` | Email do admin inicial |
| `SEEDED_ADMIN_PASSWORD` | não | `Admin@123` | Senha inicial — **trocar em prod** |
| `SEEDED_ADMIN_NAME` | não | `Administrador` | Nome exibido |

O seed roda apenas se não existir admin (implementação Fase 0 MVP).

---

## Exemplo `.env` desenvolvimento

```env
ENVIRONMENT=development
DOMAIN=localhost

POSTGRES_USER=arpadesk
POSTGRES_PASSWORD=devpass
POSTGRES_DB=arpadesk_dev
DATABASE_URL=postgresql+psycopg2://arpadesk:devpass@postgres:5432/arpadesk_dev

JWT_SECRET_KEY=dev-only-change-in-production
JWT_EXPIRES_MINUTES=480

VAULT_MASTER_KEY=dev-vault-key-change-in-production-32b

CORS_ORIGINS=http://localhost:5173
VITE_API_URL=http://localhost:8000

UPLOAD_DIR=/data/uploads

S3_ENDPOINT=http://minio:9000
S3_ACCESS_KEY=arpadesk
S3_SECRET_KEY=devminiopass
S3_BUCKET=arpadesk
REDIS_URL=redis://redis:6379/0

SEEDED_ADMIN_EMAIL=admin@arpadesk.local
SEEDED_ADMIN_PASSWORD=Admin@123
SEEDED_ADMIN_NAME=Administrador
```

---

## Exemplo `.env` VPS produção (trecho)

```env
ENVIRONMENT=production
DOMAIN=arpadesk.seudominio.com.br

POSTGRES_USER=arpadesk
POSTGRES_PASSWORD=<openssl rand -base64 24>
POSTGRES_DB=arpadesk_prod
DATABASE_URL=postgresql+psycopg2://arpadesk:<SENHA>@postgres:5432/arpadesk_prod

JWT_SECRET_KEY=<openssl rand -hex 32>
VAULT_MASTER_KEY=<openssl rand -base64 32>

CORS_ORIGINS=https://arpadesk.seudominio.com.br
VITE_API_URL=https://arpadesk.seudominio.com.br

SEEDED_ADMIN_PASSWORD=<senha forte — trocar após 1º login>
```

---

## Onde cada serviço lê as variáveis

| Serviço | Fonte |
|---------|-------|
| `postgres` | `POSTGRES_*` no compose |
| `minio` | `S3_*` no compose / `.env` |
| `redis` | `REDIS_URL` no compose |
| `backend` | `env_file: .env` + overrides no compose |
| `frontend` (build prod) | `VITE_API_URL` como build arg |
| `frontend` (dev) | `environment` no compose dev |
| `caddy` | `DOMAIN` no compose prod |

## Datas e períodos

Não há variável de ambiente para semana operacional. A regra está em código:

- Frontend: `frontend/src/lib/calendar.js`
- Backend: `backend/app/services/calendar.py`

Documentação: [06-calendario-periodos.md](./06-calendario-periodos.md). Na VPS, configure `timedatectl set-timezone America/Sao_Paulo` para que `date.today()` do backend coincida com o calendário brasileiro.
