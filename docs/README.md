# Documentação Arpadesk

Índice dos guias operacionais do repositório.

| Doc | Conteúdo |
|-----|----------|
| [00-organizacao-repositorio.md](./00-organizacao-repositorio.md) | Estrutura de pastas e convenções de código |
| [01-setup-dev-local.md](./01-setup-dev-local.md) | Pré-requisitos Windows e primeiro run local |
| [02-docker-local.md](./02-docker-local.md) | Compose de desenvolvimento, comandos e troubleshooting |
| [03-deploy-vps.md](./03-deploy-vps.md) | Deploy na VPS (SSH + Portainer), checklist pós-deploy |
| [04-manutencao-backup.md](./04-manutencao-backup.md) | Backup PostgreSQL, MinIO, volumes, updates |
| [05-variaveis-ambiente.md](./05-variaveis-ambiente.md) | Referência completa de variáveis `.env` |
| [06-calendario-periodos.md](./06-calendario-periodos.md) | Semana operacional, caixa fechado, semana aberta |
| [07-migracao-local-vps.md](./07-migracao-local-vps.md) | **Migrar dados do PC para VPS** (dump + MinIO) |
| [PLANO-MVP.md](./PLANO-MVP.md) | Plano de produto (financeiro, suporte, kanban, RBAC) |

## Scripts auxiliares

| Script | Onde roda | Função |
|--------|-----------|--------|
| `scripts/backup-local.ps1` | Windows (PC dev) | Gera pasta `backups/migracao_*` para enviar à VPS |
| `scripts/restore-on-vps.sh` | VPS Linux | Restaura postgres + MinIO a partir de `BACKUP_DIR` |

## Fluxo recomendado

1. **Desenvolvimento:** leia **00**, **01** e use **02** no dia a dia (`docker-compose.dev.yml`).
2. **Antes da VPS:** leia **03**, **05** e **07** — especialmente migração se já testou localmente (AGENCIA).
3. **Na VPS no ar:** configure backup conforme **04**.
4. **Regras de semana / caixa:** **06** (admin vs equipe, restore vigência no Arquivo).

## Templates de ambiente

| Arquivo | Uso |
|---------|-----|
| `.env.example` | Desenvolvimento local — copiar para `.env` |
| `.env.vps.example` | Staging/produção na VPS — copiar para `.env` na VPS |
