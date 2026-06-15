# Arpadesk

Sistema web de gestão financeira orientada a projetos (vendas, comissões, despesas, pagamentos) e cofre de ativos sensíveis (Suporte). Stack: **React + FastAPI + PostgreSQL + Docker**.

## Pré-requisitos

- [Docker Desktop](https://www.docker.com/products/docker-desktop/) (Windows, WSL2)
- Git

## Quick start (local)

```powershell
cd c:\xampp\htdocs\arpadesk
copy .env.example .env
docker compose -f docker-compose.dev.yml up --build
```

| URL | Endereço |
|-----|----------|
| App | http://localhost:5173 |
| API | http://localhost:8000 |
| Health | http://localhost:8000/api/health |
| Swagger | http://localhost:8000/docs |

## Documentação

| Guia | Descrição |
|------|-----------|
| [docs/README.md](./docs/README.md) | Índice completo |
| [docs/01-setup-dev-local.md](./docs/01-setup-dev-local.md) | Primeiro run no Windows |
| [docs/02-docker-local.md](./docs/02-docker-local.md) | Comandos Docker do dia a dia |
| [docs/03-deploy-vps.md](./docs/03-deploy-vps.md) | Deploy VPS (SSH + Portainer) |
| [docs/PLANO-MVP.md](./docs/PLANO-MVP.md) | Plano de produto e fases |

## Estrutura

```
backend/     FastAPI + PostgreSQL
frontend/    React (Vite)
docker/      Dockerfiles e configs
docs/        Documentação operacional
```

## Repositório

https://github.com/suporteagenciazx/arpadesk
