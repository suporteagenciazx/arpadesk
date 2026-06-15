# 00 — Organização do repositório

## Estrutura de pastas

```
arpadesk/
├── README.md
├── .env.example                 # template — copiar para .env (nunca commitar .env)
├── docker-compose.yml           # produção / VPS (Caddy + stack fechada)
├── docker-compose.dev.yml       # desenvolvimento local
├── docker/                      # Dockerfiles, nginx, Caddyfile
├── backend/
│   ├── app/
│   │   ├── main.py              # FastAPI app + lifespan
│   │   ├── config.py            # settings via pydantic-settings
│   │   ├── routers/             # endpoints por módulo
│   │   ├── models/              # SQLAlchemy
│   │   ├── schemas/             # Pydantic request/response
│   │   └── services/            # regras de negócio
│   ├── alembic/                 # migrations
│   └── requirements.txt
├── frontend/
│   ├── src/
│   │   ├── pages/               # telas (Financeiro, Suporte, Config)
│   │   ├── components/          # UI reutilizável
│   │   └── lib/api.js           # axios + JWT
│   └── package.json
└── docs/                        # esta documentação
```

## Convenções de código

| Pasta | Responsabilidade |
|-------|------------------|
| `backend/app/routers/` | HTTP por módulo: `auth`, `projects`, `sales`, `assets`, `health` |
| `backend/app/models/` | Entidades SQLAlchemy (PostgreSQL) |
| `backend/app/schemas/` | Validação entrada/saída API |
| `backend/app/services/` | Comissões, fechamento de período, cofre de credenciais |
| `frontend/src/pages/` | Rotas principais da aplicação |
| `frontend/src/components/` | Componentes compartilhados (layout, tabelas, kanban) |
| `frontend/src/lib/` | API client, helpers, constantes |

## Regras gerais

- **Backend**: lógica de negócio sempre em `services/`, não nos routers.
- **Frontend**: chamadas HTTP só via `lib/api.js`.
- **Segredos**: nunca em código; só via `.env` (local) ou env do Portainer (VPS).
- **Migrations**: toda alteração de schema passa por Alembic.
- **Uploads**: comprovantes em volume `uploads_data` (prod) ou `./data/uploads` (dev).

## Ambientes

| Ambiente | Compose | Onde roda |
|----------|---------|-----------|
| Desenvolvimento | `docker-compose.dev.yml` | PC (Windows + Docker Desktop) |
| Staging | `docker-compose.yml` | VPS `/srv/arpadesk-staging` |
| Produção | `docker-compose.yml` | VPS `/srv/arpadesk-prod` |

Cada ambiente tem seu próprio `.env` e banco PostgreSQL separado.

## Branches sugeridas

- `develop` → deploy em staging
- `main` → deploy em produção (após validação em staging)
