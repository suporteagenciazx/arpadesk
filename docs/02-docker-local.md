# 02 — Docker local (desenvolvimento)

Referência de comandos para o ambiente de desenvolvimento com `docker-compose.dev.yml`.

## Serviços

| Serviço | Imagem / build | Porta | Função |
|---------|----------------|-------|--------|
| `postgres` | postgres:16-alpine | 5432 | Banco de dados |
| `backend` | docker/backend.Dockerfile.dev | 8000 | FastAPI com `--reload` |
| `frontend` | docker/frontend.Dockerfile.dev | 5173 | Vite dev server (HMR) |

## Comandos frequentes

```powershell
# Subir tudo (build + run)
docker compose -f docker-compose.dev.yml up --build

# Subir em background
docker compose -f docker-compose.dev.yml up -d --build

# Só PostgreSQL
docker compose -f docker-compose.dev.yml up -d postgres

# Ver logs
docker compose -f docker-compose.dev.yml logs -f backend
docker compose -f docker-compose.dev.yml logs -f frontend

# Parar
docker compose -f docker-compose.dev.yml down

# Parar e apagar volume do banco (reset total)
docker compose -f docker-compose.dev.yml down -v
```

## Hot reload

- **Backend**: código montado em volume `./backend:/app` — salvar arquivo recarrega o uvicorn.
- **Frontend**: Vite HMR em `./frontend` — alterações refletem no browser sem rebuild.

## Volumes locais

| Volume | Conteúdo |
|--------|----------|
| `pg_dev_data` | Dados PostgreSQL |
| `./data/uploads` | Uploads de teste (comprovantes) |

## Troubleshooting

### Porta 5432 ou 8000 já em uso

Altere no `docker-compose.dev.yml` ou pare o processo conflitante:

```powershell
netstat -ano | findstr :8000
```

### Backend não conecta ao Postgres

1. Confirme que `DATABASE_URL` no `.env` usa host `postgres` (nome do serviço Docker).
2. Aguarde o healthcheck do Postgres antes do backend subir.
3. Veja logs: `docker compose -f docker-compose.dev.yml logs postgres backend`.

### Frontend não alcança a API

- `VITE_API_URL` deve ser `http://localhost:8000` (browser acessa o host, não o nome do container).
- CORS: `CORS_ORIGINS=http://localhost:5173` no `.env`.

### Rebuild forçado após mudar dependências

```powershell
docker compose -f docker-compose.dev.yml build --no-cache backend frontend
docker compose -f docker-compose.dev.yml up -d
```

### Limpar espaço Docker

```powershell
docker system prune -f
```

## Diferença para produção

Este compose **não** inclui Caddy nem build estático do frontend. Para deploy na VPS use `docker-compose.yml` — veja [03-deploy-vps.md](./03-deploy-vps.md).
