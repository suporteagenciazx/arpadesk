# 03 — Deploy na VPS

Guia para subir o Arpadesk em staging e produção com Docker. Cobre deploy via **SSH + docker compose** e via **Portainer**.

> Leia também [05-variaveis-ambiente.md](./05-variaveis-ambiente.md) antes de editar o `.env` na VPS.

---

## Local vs VPS — o que muda

| Item | Local (`docker-compose.dev.yml`) | VPS (`docker-compose.yml`) |
|------|----------------------------------|----------------------------|
| **HTTPS** | HTTP (`localhost`) | Caddy + Let's Encrypt |
| **Caddy** | Não sobe | Obrigatório — `/api/*` → backend, `/` → frontend |
| **Domínio** | `localhost` | `DOMAIN=arpadesk.seudominio.com.br` |
| **JWT_SECRET_KEY** | valor dev no `.env.example` | `openssl rand -hex 32` — único por ambiente |
| **VAULT_MASTER_KEY** | chave dev | chave forte + **backup offline** |
| **Senhas seed admin** | `Admin@123` ok em dev | trocar após 1º login |
| **CORS_ORIGINS** | `http://localhost:5173` | `https://seudominio.com.br` (sem `*`) |
| **VITE_API_URL / build** | `http://localhost:8000` | `https://seudominio.com.br` (sem `/api`) |
| **Postgres** | porta 5432 exposta | **sem porta pública** — rede interna Docker |
| **Volumes** | `pg_dev_data`, `minio_dev_data`, `redis_dev_data` | `pg_data`, `minio_data`, `redis_data`, `uploads_data`, `caddy_data` |
| **MinIO** | API 9000 + console 9001 | só rede interna `appnet` |
| **Redis** | porta 6379 (dev) | só rede interna — cache 120s |
| **Frontend** | Vite dev (HMR) | `npm run build` + Nginx estático |
| **Backend** | `--reload`, debug | uvicorn produção, sem reload |
| **ENVIRONMENT** | `development` | `production` |
| **Swagger `/docs`** | liberado | desabilitado ou restrito por IP |
| **Fuso horário VPS** | N/A | `America/Sao_Paulo` (datas do backend) |
| **Semana operacional** | Fuso do navegador | Seg–sex civil; ver [06-calendario-periodos.md](./06-calendario-periodos.md) |
| **Firewall** | N/A | UFW: 22, 80, 443, 9443 |
| **Backups** | opcional | cron `pg_dump` + volume uploads |
| **Pastas na VPS** | — | `/srv/arpadesk-staging` e `/srv/arpadesk-prod` separados |

---

## Fase 1 — Pré-requisitos na VPS

### DNS

Registro **A** apontando para o IP da VPS:

| Tipo | Nome | Valor |
|------|------|-------|
| A | `arpadesk` (ou subdomínio) | IP da VPS |

Teste: `nslookup arpadesk.seudominio.com.br`

### Docker (Ubuntu)

```bash
sudo apt update && sudo apt upgrade -y
sudo timedatectl set-timezone America/Sao_Paulo

sudo apt install -y ca-certificates curl gnupg lsb-release
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | \
  sudo gpg --dearmor -o /usr/share/keyrings/docker-archive-keyring.gpg
echo "deb [arch=$(dpkg --print-architecture) \
  signed-by=/usr/share/keyrings/docker-archive-keyring.gpg] \
  https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable" | \
  sudo tee /etc/apt/sources.list.d/docker.list
sudo apt update
sudo apt install -y docker-ce docker-ce-cli containerd.io \
  docker-buildx-plugin docker-compose-plugin
sudo usermod -aG docker $USER
newgrp docker
docker --version && docker compose version
```

### Firewall (UFW)

```bash
sudo ufw allow OpenSSH
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw allow 9443/tcp    # Portainer
sudo ufw enable
sudo ufw status
```

### Portainer (se ainda não instalado)

```bash
docker volume create portainer_data
docker run -d \
  -p 9443:9443 \
  --name portainer \
  --restart=always \
  -v /var/run/docker.sock:/var/run/docker.sock \
  -v portainer_data:/data \
  portainer/portainer-ce:latest
```

Acesse `https://IP_DA_VPS:9443` e crie o usuário admin do Portainer.

---

## Fase 2 — Deploy via SSH + docker compose

### Staging

```bash
sudo mkdir -p /srv/arpadesk-staging
sudo chown -R $USER:$USER /srv/arpadesk-staging
cd /srv/arpadesk-staging
git clone https://github.com/suporteagenciazx/arpadesk.git .
cp .env.example .env
nano .env   # ajustar DOMAIN, secrets, POSTGRES_PASSWORD
chmod 600 .env
docker compose --env-file .env up -d --build
docker compose ps
docker compose logs -f backend
```

### Produção

Repita em `/srv/arpadesk-prod` com:
- branch `main`
- `.env` com secrets **diferentes** de staging
- `POSTGRES_DB=arpadesk_prod`
- domínio de produção

### Gerar secrets fortes

```bash
openssl rand -hex 32          # JWT_SECRET_KEY
openssl rand -base64 32       # VAULT_MASTER_KEY
openssl rand -base64 24       # POSTGRES_PASSWORD
```

### Exemplo `.env` VPS (staging)

```env
ENVIRONMENT=production
DOMAIN=arpadesk-staging.seudominio.com.br

POSTGRES_USER=arpadesk
POSTGRES_PASSWORD=COLE_SENHA_FORTE
POSTGRES_DB=arpadesk_staging
DATABASE_URL=postgresql+psycopg2://arpadesk:COLE_SENHA_FORTE@postgres:5432/arpadesk_staging

JWT_SECRET_KEY=COLE_OPENSSL_RAND_HEX_32
JWT_EXPIRES_MINUTES=480
VAULT_MASTER_KEY=COLE_OPENSSL_RAND_BASE64_32

CORS_ORIGINS=https://arpadesk-staging.seudominio.com.br
VITE_API_URL=https://arpadesk-staging.seudominio.com.br

SEEDED_ADMIN_EMAIL=admin@arpadesk.local
SEEDED_ADMIN_PASSWORD=TROQUE_IMEDIATAMENTE
SEEDED_ADMIN_NAME=Administrador
```

### Redeploy após `git pull`

```bash
cd /srv/arpadesk-staging
git pull
docker compose --env-file .env build
docker compose --env-file .env up -d
```

---

## Fase 3 — Deploy via Portainer

### Opção A — Stack a partir do filesystem (após clone SSH)

1. Portainer → **Stacks** → **Add stack**
2. Nome: `arpadesk-staging`
3. **Web editor**: cole o conteúdo de `docker-compose.yml` **ou** use upload
4. **Environment variables** → carregue o `.env` ou cole cada variável
5. **Deploy the stack**

> Stacks com `build:` precisam que os arquivos existam no host. Se o build falhar, use primeiro o deploy via SSH (Opção híbrida abaixo) e gerencie depois pelo Portainer.

**Híbrido (recomendado na 1ª vez):**

```bash
cd /srv/arpadesk-staging
docker compose --env-file .env build
docker compose --env-file .env up -d
```

A stack aparece automaticamente no Portainer em **Stacks**.

### Opção B — Stack a partir do Git

1. **Stacks** → **Add stack** → aba **Repository**
2. **Repository URL:** repo Git do Arpadesk
3. **Reference:** `refs/heads/develop` (staging) ou `refs/heads/main` (prod)
4. **Compose path:** `docker-compose.yml`
5. **Environment variables:** todas as chaves do `.env`
6. **Deploy the stack**

> `docker/` e `docker-compose.yml` devem estar commitados no repositório.

### Verificar no Portainer

| Onde | O que conferir |
|------|----------------|
| Stacks → arpadesk-staging | 4 containers **running** (postgres, backend, frontend, caddy) |
| backend → Logs | Sem erro de conexão PostgreSQL |
| caddy → Logs | Certificado Let's Encrypt emitido |
| Volumes | `pg_data`, `uploads_data`, `caddy_data` criados |

---

## Checklist pós-deploy

- [ ] `https://DOMAIN` abre sem erro de certificado
- [ ] `https://DOMAIN/api/health` retorna JSON ok
- [ ] Frontend carrega via HTTPS
- [ ] Postgres **não** acessível externamente (porta 5432 fechada)
- [ ] Senha seed admin trocada
- [ ] `VAULT_MASTER_KEY` anotada em local seguro offline
- [ ] Backup configurado — [04-manutencao-backup.md](./04-manutencao-backup.md)

Teste rápido:

```bash
curl -s https://arpadesk-staging.seudominio.com.br/api/health
```

---

## Staging antes de produção

| Ambiente | Pasta VPS | Branch | Banco |
|----------|-----------|--------|-------|
| Staging | `/srv/arpadesk-staging` | `develop` | `arpadesk_staging` |
| Produção | `/srv/arpadesk-prod` | `main` | `arpadesk_prod` |

Valide fechamento semanal, kanban, uploads e **filtro de período (semana seg–sex)** em staging por 1–2 semanas antes de promover para produção.

---

## Operação diária (Portainer ou SSH)

```bash
# Logs
docker compose logs -f backend
docker compose logs -f caddy

# Restart de um serviço
docker compose restart backend

# Status
docker compose ps
```

No Portainer: **Stacks** → stack → **Logs** / **Restart** por container.
