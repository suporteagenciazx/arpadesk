# 01 — Setup de desenvolvimento local

Guia para rodar o Arpadesk no Windows pela primeira vez.

## Pré-requisitos


| Ferramenta     | Versão mínima | Observação                                |
| -------------- | ------------- | ----------------------------------------- |
| Docker Desktop | recente       | WSL2 habilitado no Windows                |
| Git            | qualquer      | clone do repositório                      |
| Node.js        | 20+           | opcional se rodar frontend fora do Docker |
| Python         | 3.11+         | opcional se rodar backend fora do Docker  |


## Primeiro run (Docker — recomendado)

Na raiz do projeto (`c:\xampp\htdocs\arpadesk`):

```powershell
# 1. Copiar variáveis de ambiente
copy .env.example .env

# 2. Subir stack de desenvolvimento
docker compose -f docker-compose.dev.yml up --build
```

Aguarde os containers `postgres`, `minio`, `redis`, `backend` e `frontend` ficarem **running**.

## URLs locais


| Serviço       | URL                                                                  |
| ------------- | -------------------------------------------------------------------- |
| Frontend      | [http://localhost:5173](http://localhost:5173)                       |
| API           | [http://localhost:8000](http://localhost:8000)                       |
| Swagger (dev) | [http://localhost:8000/docs](http://localhost:8000/docs)             |
| Health check  | [http://localhost:8000/api/health](http://localhost:8000/api/health) |
| MinIO API     | [http://localhost:9000](http://localhost:9000)                       |
| MinIO Console | [http://localhost:9001](http://localhost:9001) (user/senha do `.env`) |
| PostgreSQL    | localhost:5432 (user/pass no `.env`)                                 |
| Redis         | localhost:6379 (cache interno; opcional no host)                   |


## Checklist primeiro run

- [x] Docker Desktop está rodando
- [ ] Arquivo `.env` existe (copiado de `.env.example`)
- [ ] `docker compose -f docker-compose.dev.yml up --build` sem erro
- [ ] [http://localhost:5173](http://localhost:5173) abre a tela de login
- [ ] [http://localhost:8000/api/health](http://localhost:8000/api/health) retorna `{"status":"ok",...}`
- [ ] Login com admin seed funciona (ver credenciais abaixo)
- [ ] [http://localhost:8000/docs](http://localhost:8000/docs) abre o Swagger (somente em `development`)

Teste rápido no PowerShell:

```powershell
curl http://localhost:8000/api/health
node frontend/src/lib/calendar.validate.mjs
```

O segundo comando valida a semana operacional (seg–sex) dos filtros financeiros.

## Rodar só o banco (backend/frontend no host)

Útil para debug com breakpoints:

```powershell
docker compose -f docker-compose.dev.yml up -d postgres
```

Backend (terminal 1):

```powershell
cd backend
pip install -r requirements.txt
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

Frontend (terminal 2):

```powershell
cd frontend
npm install
npm run dev
```

## Credenciais seed (desenvolvimento)

Definidas no `.env` — **nunca use em produção**:


| Variável                | Default dev                                         |
| ----------------------- | --------------------------------------------------- |
| `SEEDED_ADMIN_EMAIL`    | `admin@arpadesk.local` |
| `SEEDED_ADMIN_PASSWORD` | `Admin@123`            |

Usuários demo criados no seed (desenvolvimento):

| Perfil     | Email                         | Senha            |
| ---------- | ----------------------------- | ---------------- |
| Financeiro | `financeiro@arpadesk.local`   | `Financeiro@123` |
| Contador   | `contador@arpadesk.local`     | `Contador@123`   |

> O seed roda automaticamente no primeiro start do backend (admin + projeto AGENCIA + usuários demo).

## Próximos passos

- Comandos do dia a dia: [02-docker-local.md](./02-docker-local.md)
- Variáveis de ambiente: [05-variaveis-ambiente.md](./05-variaveis-ambiente.md)
- Calendário e filtros de período: [06-calendario-periodos.md](./06-calendario-periodos.md)
- Subir na VPS com os mesmos dados: [07-migracao-local-vps.md](./07-migracao-local-vps.md)
- O que construir: [PLANO-MVP.md](./PLANO-MVP.md)

