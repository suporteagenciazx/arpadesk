# 00 — Organização do repositório

## Estrutura de pastas

```
arpadesk/
├── README.md
├── .env.example                 # template dev — copiar para .env
├── .env.vps.example             # template VPS staging/prod
├── docker-compose.yml           # produção / VPS (Caddy + stack fechada)
├── docker-compose.dev.yml       # desenvolvimento local
├── docker/
│   ├── backend.Dockerfile       # API produção
│   ├── frontend.Dockerfile      # build React + Nginx
│   ├── backend.Dockerfile.dev
│   ├── frontend.Dockerfile.dev
│   ├── Caddyfile                # reverse proxy HTTPS (VPS)
│   └── nginx.conf               # frontend estático
├── scripts/
│   ├── backup-local.ps1         # backup PC → migracao VPS
│   └── restore-on-vps.sh        # restore na VPS
├── backend/
│   ├── app/
│   │   ├── main.py              # FastAPI app + lifespan
│   │   ├── config.py            # settings via pydantic-settings
│   │   ├── models.py            # SQLAlchemy (PostgreSQL)
│   │   ├── schemas.py           # Pydantic request/response
│   │   ├── database_migrations.py  # migrations idempotentes no startup
│   │   ├── routers/             # endpoints por módulo
│   │   └── services/            # regras de negócio
│   └── requirements.txt
├── frontend/
│   ├── src/
│   │   ├── pages/               # Financeiro, Marketing, Gestão, Config, Suporte
│   │   ├── components/          # Layout, modais, filtros de período
│   │   ├── context/             # Auth, Project, Sectors, FinancePeriod
│   │   └── lib/                 # api.js, calendar.js, privileges, helpers
│   └── package.json
└── docs/                        # documentação operacional
```

## Módulos principais

| Módulo | Frontend | Backend (routers) |
|--------|----------|-------------------|
| Financeiro | `pages/finance/` | `sales`, `expenses`, `payments`, `report_*`, `cash_closings` |
| Marketing | `pages/marketing/` | `marketing` |
| Gestão | `pages/gestao/` | `gestao` |
| Suporte (cofre) | `pages/Suporte.jsx` | (assets via services) |
| Config / usuários | `pages/config/` | `users`, `telegram`, `sectors` |
| Auth | `pages/Login.jsx` | `auth` |

## Convenções de código

| Pasta | Responsabilidade |
|-------|------------------|
| `backend/app/routers/` | HTTP por módulo — validação mínima, delega para services |
| `backend/app/models.py` | Entidades SQLAlchemy |
| `backend/app/schemas.py` | Validação entrada/saída API |
| `backend/app/services/` | Comissões, fechamento, calendário, cache, Telegram, marketing |
| `frontend/src/pages/` | Rotas principais da aplicação |
| `frontend/src/components/` | Componentes compartilhados |
| `frontend/src/lib/` | API client, calendário (`calendar.js`), permissões |

## Regras gerais

- **Backend**: lógica de negócio em `services/`, não nos routers.
- **Frontend**: chamadas HTTP via `lib/api.js`.
- **Segredos**: nunca em código; só `.env` (local) ou env do Portainer/compose (VPS).
- **Schema DB**: alterações em `database_migrations.py` (executadas no startup) + modelos em `models.py`.
- **Uploads**: comprovantes no MinIO — ver [05-variaveis-ambiente.md](./05-variaveis-ambiente.md).
- **Datas / semana operacional:** [06-calendario-periodos.md](./06-calendario-periodos.md).

## Ambientes

| Ambiente | Compose | Onde roda |
|----------|---------|-----------|
| Desenvolvimento | `docker-compose.dev.yml` | PC (Windows + Docker Desktop) |
| Staging | `docker-compose.yml` | VPS `/srv/arpadesk-staging` |
| Produção | `docker-compose.yml` | VPS `/srv/arpadesk-prod` |

Cada ambiente tem `.env` próprio e banco PostgreSQL separado.

## Branches sugeridas

- `develop` → deploy em staging
- `main` → deploy em produção (após validação em staging)

## Deploy

Passo a passo VPS: **[03-deploy-vps.md](./03-deploy-vps.md)**
