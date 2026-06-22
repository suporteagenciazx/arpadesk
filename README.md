# Arpadesk

Sistema web de gestão financeira orientada a projetos (vendas, comissões, despesas, pagamentos, relatórios) e cofre de ativos sensíveis (Suporte). Stack: **React + FastAPI + PostgreSQL + Docker**.

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
| [docs/07-migracao-local-vps.md](./docs/07-migracao-local-vps.md) | **Migrar dados do PC para VPS** |
| [docs/05-variaveis-ambiente.md](./docs/05-variaveis-ambiente.md) | Referência de variáveis `.env` |
| [docs/06-calendario-periodos.md](./docs/06-calendario-periodos.md) | Semana operacional e caixa fechado |
| [docs/08-marketing-campanhas.md](./docs/08-marketing-campanhas.md) | Marketing — campanhas semanais |
| [docs/PLANO-MVP.md](./docs/PLANO-MVP.md) | Plano de produto e fases |

## Deploy VPS

**Guia completo (DNS → online):** [docs/03-deploy-vps.md](./docs/03-deploy-vps.md)

Resumo:

```bash
# Na VPS (após DNS, Docker e Portainer ok)
sudo mkdir -p /srv/arpadesk-staging && cd /srv/arpadesk-staging
git clone https://github.com/suporteagenciazx/arpadesk.git .
cp .env.vps.example .env && nano .env && chmod 600 .env
docker compose --env-file .env up -d --build
curl -s https://SEU_DOMINIO/api/health
```

- Variáveis: [docs/05-variaveis-ambiente.md](./docs/05-variaveis-ambiente.md)
- Migrar dados do PC (AGENCIA): [docs/07-migracao-local-vps.md](./docs/07-migracao-local-vps.md)

### Backup local antes de subir na VPS

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\backup-local.ps1
```

## Estrutura

```
backend/     FastAPI + PostgreSQL
frontend/    React (Vite)
docker/      Dockerfiles e configs
docs/        Documentação operacional
```

## Repositório

https://github.com/suporteagenciazx/arpadesk
