# 03 — Deploy na VPS (passo a passo)

Guia objetivo: **do apontamento do domínio até a plataforma online** com Docker + Portainer.

| Documento relacionado | Quando usar |
|----------------------|-------------|
| [05-variaveis-ambiente.md](./05-variaveis-ambiente.md) | Referência de cada variável do `.env` |
| [07-migracao-local-vps.md](./07-migracao-local-vps.md) | Levar dados do PC (AGENCIA, relatórios, CP) |
| [04-manutencao-backup.md](./04-manutencao-backup.md) | Backup e updates após estar no ar |

---

## Visão geral (ordem)

```
1. DNS (domínio → IP da VPS)
2. Verificar Docker + Portainer (ou instalar)
3. Preparar VPS (fuso, firewall, pasta do projeto)
4. Clonar repositório + configurar .env
5. Subir stack (SSH ou Portainer)
6. Validar HTTPS + login
7. (Opcional) Migrar dados do PC
```

> **⚠️ Já usa o sistema localmente (AGENCIA, usuários, configurações)?**  
> **Não pule o Passo 7.** Sem migração a VPS sobe vazia — usuários, projetos, permissões e relatórios **não** vêm automaticamente.  
> Guia completo: **[07-migracao-local-vps.md](./07-migracao-local-vps.md)** (backup PC → restore VPS).

**Stack na VPS:** 6 containers — `postgres`, `minio`, `redis`, `backend`, `frontend`, `caddy`  
**Arquivo usado:** `docker-compose.yml` (não use `docker-compose.dev.yml` em produção)

### Dois caminhos possíveis

| Caminho | Quando usar | Resultado na VPS |
|---------|-------------|------------------|
| **A — Instalação limpa** | Primeiro deploy, sem dados no PC | Só usuário seed do `.env`; projetos vazios |
| **B — Migrar do PC** ⭐ | Já testou local (AGENCIA, equipe, relatórios) | **Igual ao PC** — usuários, permissões, vendas, CP, etc. |

Se você está no caminho **B**, leia o **[Passo 7](#passo-7--migrar-dados-do-pc-igual-ao-ambiente-local)** antes de subir a stack completa pela primeira vez.

---

## Passo 1 — Apontar o domínio (DNS)

No painel do seu registrador (Registro.br, Cloudflare, etc.), crie um registro **A**:

| Tipo | Nome | Valor | TTL |
|------|------|-------|-----|
| A | `arpadesk` (ou o subdomínio desejado) | **IP público da VPS** | 300–3600 |

Exemplo: `arpadesk.seudominio.com.br` → `203.0.113.10`

**Validar** (no seu PC ou na VPS):

```bash
nslookup arpadesk.seudominio.com.br
# ou
dig +short arpadesk.seudominio.com.br
```

O IP retornado deve ser o da VPS. Propagação pode levar de minutos a algumas horas.

> **Importante:** só prossiga para o Passo 5 depois que o DNS estiver correto — o Caddy precisa do domínio resolvendo para emitir HTTPS (Let's Encrypt).

---

## Passo 2 — Docker e Portainer

### 2A — Já tenho Docker e Portainer (seu caso)

Conecte na VPS via SSH e rode o checklist abaixo. **Todos os itens devem passar** antes do Passo 3.

```bash
# --- Checklist rápido ---
docker --version
docker compose version
docker ps
sudo systemctl is-active docker    # deve: active
timedatectl | grep "Time zone"     # recomendado: America/Sao_Paulo
```

| Verificação | Comando | Resultado esperado |
|-------------|---------|-------------------|
| Docker Engine | `docker --version` | 24+ ou 25+ |
| Compose plugin | `docker compose version` | v2.x (não use `docker-compose` v1 isolado) |
| Daemon ativo | `sudo systemctl status docker` | `active (running)` |
| Usuário no grupo docker | `groups $USER` | contém `docker` (evita sudo em todo comando) |
| Portainer rodando | `docker ps --filter name=portainer` | container `Up`, porta `9443` |
| Porta 80 livre* | `sudo ss -tlnp \| grep ':80 '` | vazio ou só Caddy futuro |
| Porta 443 livre* | `sudo ss -tlnp \| grep ':443 '` | vazio ou só Caddy futuro |
| Disco | `df -h /` | ≥ 10 GB livres recomendado |
| Memória | `free -h` | ≥ 2 GB RAM recomendado |

\* Se já houver Nginx/Apache na VPS, pare o serviço conflitante ou use outra VPS — o Arpadesk usa **Caddy** nas portas 80 e 443.

**Testar Portainer no navegador:**

```
https://IP_DA_VPS:9443
```

Faça login. Em **Environments → local** deve aparecer o Docker local conectado (ícone verde).

**Se `docker compose` não existir** (só `docker-compose` antigo):

```bash
sudo apt update
sudo apt install -y docker-compose-plugin
docker compose version
```

**Se seu usuário não estiver no grupo docker:**

```bash
sudo usermod -aG docker $USER
newgrp docker
```

**Firewall (UFW) — conferir portas abertas:**

```bash
sudo ufw status
```

Devem estar permitidas: **22** (SSH), **80**, **443**, **9443** (Portainer). Se UFW estiver inativo e a VPS for pública, configure:

```bash
sudo ufw allow OpenSSH
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw allow 9443/tcp
sudo ufw enable
sudo ufw status
```

✅ **Checklist 2A concluído?** → Vá para o **Passo 3**.

---

### 2B — Instalar Docker e Portainer do zero

Use esta seção **somente** se o Passo 2A falhou (Docker não instalado).

<details>
<summary>Clique para expandir — instalação Ubuntu/Debian</summary>

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

**Portainer:**

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

Acesse `https://IP_DA_VPS:9443`, crie o usuário admin e volte ao **Passo 2A** para validar.

</details>

---

## Passo 3 — Preparar pasta do projeto na VPS

Escolha o ambiente (staging é recomendado na 1ª vez):

| Ambiente | Pasta sugerida | Banco (`POSTGRES_DB`) |
|----------|----------------|------------------------|
| Staging | `/srv/arpadesk-staging` | `arpadesk_staging` |
| Produção | `/srv/arpadesk-prod` | `arpadesk_prod` |

```bash
sudo mkdir -p /srv/arpadesk-staging/backups
sudo chown -R $USER:$USER /srv/arpadesk-staging
cd /srv/arpadesk-staging
```

---

## Passo 4 — Clonar código e configurar `.env`

```bash
git clone https://github.com/suporteagenciazx/arpadesk.git .
cp .env.vps.example .env
chmod 600 .env
nano .env
```

### Variáveis mínimas para editar

| Variável | O que colocar |
|----------|----------------|
| `DOMAIN` | `arpadesk.seudominio.com.br` (sem `https://`) |
| `POSTGRES_PASSWORD` | senha forte |
| `DATABASE_URL` | mesma senha em `postgresql+psycopg2://arpadesk:SENHA@postgres:5432/arpadesk_staging` |
| `JWT_SECRET_KEY` | `openssl rand -hex 32` |
| `VAULT_MASTER_KEY` | `openssl rand -base64 32` — **anote offline** (ou **copie do PC** se migra dados) |
| `CORS_ORIGINS` | `https://arpadesk.seudominio.com.br` |
| `SEEDED_ADMIN_PASSWORD` | senha inicial do admin (trocar após 1º login) |

Gerar secrets na VPS:

```bash
openssl rand -hex 32          # JWT_SECRET_KEY
openssl rand -base64 32       # VAULT_MASTER_KEY
openssl rand -base64 24       # POSTGRES_PASSWORD
```

> O frontend em produção usa `https://${DOMAIN}` no build (definido no `docker-compose.yml`). Não é necessário `VITE_API_URL` no `.env` da VPS.

---

## Passo 5 — Subir a plataforma

> **Migrando dados do PC?** Não suba a stack completa ainda. Vá direto ao **[Passo 7](#passo-7--migrar-dados-do-pc-igual-ao-ambiente-local)** — suba só `postgres`, restaure o backup, depois `up -d --build`.  
> O caminho abaixo é para **instalação limpa** (sem dados locais).

### Opção A — SSH (recomendado na 1ª vez)

Na pasta do projeto (`/srv/arpadesk-staging`):

```bash
docker compose --env-file .env up -d --build
```

Acompanhe até estabilizar:

```bash
docker compose ps
docker compose logs -f backend
# Ctrl+C para sair; depois:
docker compose logs -f caddy
```

**Todos os 6 serviços devem estar `running`.** Postgres pode levar ~30s na 1ª subida.

### Opção B — Portainer (após 1ª build via SSH)

1. Portainer → **Stacks** → **Add stack**
2. Nome: `arpadesk-staging`
3. **Web editor:** cole o conteúdo de `docker-compose.yml` **ou** use **Upload** do arquivo
4. **Environment variables:** importe o `.env` (ou cole variável a variável)
5. **Deploy the stack**

> Stacks com `build:` precisam dos arquivos no host. Por isso a **1ª vez** é mais simples via SSH (Opção A). Depois a stack aparece no Portainer para logs/restart.

**Alternativa Portainer — Git:**

1. Stacks → Add stack → **Repository**
2. URL do repo, branch `main` ou `develop`
3. Compose path: `docker-compose.yml`
4. Environment variables do `.env`

---

## Passo 6 — Validar que está online

### 6.1 — Testes automáticos (SSH)

```bash
curl -sI https://arpadesk.seudominio.com.br | head -5
curl -s https://arpadesk.seudominio.com.br/api/health
```

Resposta esperada do health: JSON com status ok.

### 6.2 — Testes no navegador

| Teste | URL | Esperado |
|-------|-----|----------|
| App | `https://SEU_DOMINIO` | Tela de login, certificado válido (cadeado) |
| API | `https://SEU_DOMINIO/api/health` | JSON ok |
| Login | credenciais do `.env` (`SEEDED_ADMIN_*`) | Entra no Financeiro |

### 6.3 — Checklist infra

- [ ] HTTPS sem aviso de certificado
- [ ] Login admin funciona
- [ ] `docker compose ps` — 6 containers **running**
- [ ] Postgres/Redis/MinIO **sem** porta exposta no host (`docker compose ps` não mostra `0.0.0.0:5432`)
- [ ] Fuso: `timedatectl` = `America/Sao_Paulo`
- [ ] `VAULT_MASTER_KEY` guardada offline
- [ ] Senha admin alterada após 1º acesso

### 6.4 — No Portainer

| Onde | Conferir |
|------|----------|
| Stacks → arpadesk-staging | 6 containers running |
| backend → Logs | Sem erro de PostgreSQL / MinIO |
| caddy → Logs | Certificado Let's Encrypt obtido |
| Volumes | `pg_data`, `minio_data`, `redis_data`, `uploads_data`, `caddy_data` |

---

## Passo 7 — Migrar dados do PC (igual ao ambiente local)

Use este passo quando quiser que a VPS fique **exatamente como está no PC agora**: usuários, senhas de login, projeto AGENCIA, atribuições por projeto, privilégios, setores, automações, Telegram, marketing, relatórios salvos e comprovantes.

> Guia detalhado com checklist completo: **[07-migracao-local-vps.md](./07-migracao-local-vps.md)**

### O que é preservado na migração

| Categoria | O que inclui | Onde vai |
|-----------|--------------|----------|
| **Usuários e acesso** | Contas, níveis, emails, comissões por projeto | PostgreSQL (`postgres.sql`) |
| **Permissões por projeto** | Setores habilitados, privilégios (aba Permissões) | `project_members.access_config` |
| **Setores globais** | Registry de setores, cores, rotas | `app_settings` |
| **Projetos** | AGENCIA, setores do projeto, configs financeiras | `projects.settings` |
| **Semana / caixa** | Período aberto, fechamentos, relatórios salvos | `projects.settings`, `cash_closings` |
| **Operação financeira** | Vendas, despesas, pagamentos, multas, comissões | PostgreSQL |
| **Marketing** | Campanhas, listas, clientes CNPJ | PostgreSQL |
| **Automações** | Regras Telegram por projeto | `project_automations` |
| **Comprovantes e PDFs** | Arquivos de vendas e importações | MinIO (`minio_data.tar.gz`) |
| **Cofre Suporte** | Credenciais criptografadas | PostgreSQL + **`VAULT_MASTER_KEY` igual** |

**Não migrar (recria sozinho):** cache Redis (TTL 120s).

### Ordem correta (resumo)

```
[PC]  backup-local.ps1  →  pasta backups/migracao_*
[PC]  scp para VPS
[VPS] git clone + .env (copiar VAULT e S3 do PC)
[VPS] docker compose up -d postgres
[VPS] restore-on-vps.sh
[VPS] docker compose up -d --build
[VPS] checklist pós-migração (doc 07)
```

### 7.1 — Backup no Windows

Com a stack local **rodando**:

```powershell
cd c:\xampp\htdocs\arpadesk
docker compose -f docker-compose.dev.yml ps
powershell -ExecutionPolicy Bypass -File .\scripts\backup-local.ps1
```

Saída em `backups\migracao_YYYYMMDD_HHMM\`:

| Arquivo | Conteúdo |
|---------|----------|
| `postgres.sql` | **Tudo** do banco (usuários, projetos, permissões, vendas…) |
| `minio_data.tar.gz` | Comprovantes e arquivos anexos |
| `env-secrets-local.txt` | `VAULT_MASTER_KEY` e `S3_*` — copiar para `.env` da VPS |

### 7.2 — Enviar para a VPS

```powershell
scp -r backups\migracao_YYYYMMDD_HHMM USUARIO@IP_VPS:/srv/arpadesk-staging/backups/
```

### 7.3 — `.env` na VPS (com dados migrados)

Use `.env.vps.example` como base, mas **copie do PC** (arquivo `env-secrets-local.txt` ou `.env` local):

| Variável | Ação |
|----------|------|
| `VAULT_MASTER_KEY` | **Igual ao local** — obrigatório se usa Suporte |
| `S3_ACCESS_KEY` / `S3_SECRET_KEY` / `S3_BUCKET` | **Iguais ao local** — MinIO restaurado |
| `JWT_SECRET_KEY` | Pode ser nova (todos fazem login de novo) ou igual |
| `POSTGRES_PASSWORD` | Nova senha forte — ajustar `DATABASE_URL` |
| `DOMAIN` / `CORS_ORIGINS` | Domínio da VPS com `https://` |
| `SEEDED_ADMIN_*` | Ignorado após restore — admin já vem no dump |

```bash
cp .env.vps.example .env
nano .env   # colar VAULT e S3 do PC + DOMAIN da VPS
chmod 600 .env
```

### 7.4 — Restaurar na VPS (antes do 1º uso)

```bash
cd /srv/arpadesk-staging
export BACKUP_DIR=/srv/arpadesk-staging/backups/migracao_YYYYMMDD_HHMM

docker compose --env-file .env up -d postgres
chmod +x scripts/restore-on-vps.sh
./scripts/restore-on-vps.sh

docker compose --env-file .env up -d --build
```

> **Importante:** restaure **antes** de usar o sistema. Se subir o backend completo antes do restore, o seed pode criar dados vazios por cima.

### 7.5 — Validar que ficou igual ao PC

- [ ] Login com **mesmo email/senha** do PC (não o seed)
- [ ] Projeto **AGENCIA** com vendas, despesas e relatórios
- [ ] Usuários e **Permissões** por projeto iguais
- [ ] Setores na sidebar e registry de Gestão
- [ ] Semana **Atual** igual (admin)
- [ ] Download de comprovante funciona
- [ ] Marketing / clientes CNPJ (se já tinha)

Checklist completo e troubleshooting: **[07-migracao-local-vps.md](./07-migracao-local-vps.md)**

---

## Passo 8 — Produção e manutenção

### Staging vs produção

| | Staging | Produção |
|---|---------|----------|
| Pasta | `/srv/arpadesk-staging` | `/srv/arpadesk-prod` |
| Branch | `develop` | `main` |
| Banco | `arpadesk_staging` | `arpadesk_prod` |
| `.env` | secrets próprios | secrets **diferentes** |

Valide 1–2 semanas em staging antes de produção.

### Atualizar após `git pull`

```bash
cd /srv/arpadesk-staging
git pull
docker compose --env-file .env build
docker compose --env-file .env up -d
```

No Portainer: stack → **Pull and redeploy** (se configurou via Git) ou restart manual.

### Comandos úteis

```bash
docker compose logs -f backend
docker compose logs -f caddy
docker compose restart backend
docker compose ps
```

Backup contínuo: [04-manutencao-backup.md](./04-manutencao-backup.md)

---

## Problemas comuns

| Sintoma | Causa provável | Ação |
|---------|----------------|------|
| VPS vazia / só admin seed | Migração não feita | Seguir **Passo 7** e [07-migracao-local-vps.md](./07-migracao-local-vps.md) |
| Login seed não funciona / dados estranhos | Restore depois do 1º `up` completo | Parar stack, refazer restore, subir de novo |
| Permissões/usuários diferentes | Dump antigo ou restore incompleto | Refazer `backup-local.ps1` e restore |
| Certificado HTTPS falha | DNS ainda não propagou | Aguardar; conferir `nslookup` |
| `address already in use :80` | Nginx/Apache na VPS | `sudo systemctl stop nginx` ou liberar porta |
| Backend reinicia em loop | `DATABASE_URL` errada | Conferir senha no `.env` |
| Frontend login ok, API falha | `CORS_ORIGINS` errado | Deve ser `https://SEU_DOMINIO` exato |
| Build falha no Portainer | Repo sem arquivos no host | Usar SSH (Passo 5A) na 1ª vez |
| Cofre Suporte ilegível após migração | `VAULT_MASTER_KEY` diferente | Usar mesma chave do PC |

---

## Referência — local vs VPS

| Item | Local (`docker-compose.dev.yml`) | VPS (`docker-compose.yml`) |
|------|----------------------------------|----------------------------|
| HTTPS | Não (localhost) | Caddy + Let's Encrypt |
| Frontend | Vite dev :5173 | Nginx estático |
| Postgres exposto | :5432 | Só rede interna |
| Swagger `/docs` | Liberado | Desabilitado em produção |
| Volumes | `*_dev_*` | `pg_data`, `minio_data`, etc. |
