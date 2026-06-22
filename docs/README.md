# Documentação Arpadesk

Índice dos guias operacionais do repositório.

## Colocar no ar (VPS)

| Ordem | Doc | Conteúdo |
|-------|-----|----------|
| 1 | **[03-deploy-vps.md](./03-deploy-vps.md)** | **Passo a passo:** DNS → Docker/Portainer → `.env` → online |
| 2 | **[07-migracao-local-vps.md](./07-migracao-local-vps.md)** | **⭐ Migrar PC → VPS:** usuários, permissões, AGENCIA, configs, CP — **igual ao local** |
| 3 | [05-variaveis-ambiente.md](./05-variaveis-ambiente.md) | Referência de variáveis `.env` |
| 4 | [04-manutencao-backup.md](./04-manutencao-backup.md) | Backup e updates |

## Desenvolvimento local

| Doc | Conteúdo |
|-----|----------|
| [00-organizacao-repositorio.md](./00-organizacao-repositorio.md) | Estrutura de pastas e convenções |
| [01-setup-dev-local.md](./01-setup-dev-local.md) | Pré-requisitos Windows e primeiro run |
| [02-docker-local.md](./02-docker-local.md) | Compose dev, comandos e troubleshooting |

## Funcionalidades

| Doc | Conteúdo |
|-----|----------|
| [06-calendario-periodos.md](./06-calendario-periodos.md) | Semana operacional, caixa fechado |
| [08-marketing-campanhas.md](./08-marketing-campanhas.md) | Marketing — campanhas, relatório, clientes |
| [PLANO-MVP.md](./PLANO-MVP.md) | Plano de produto |

## Scripts auxiliares

| Script | Onde roda | Função |
|--------|-----------|--------|
| `scripts/backup-local.ps1` | Windows (PC dev) | Gera `backups/migracao_*` para enviar à VPS |
| `scripts/restore-on-vps.sh` | VPS Linux | Restaura postgres + MinIO |

## Templates de ambiente

| Arquivo | Uso |
|---------|-----|
| `.env.example` | Dev local — `copy .env.example .env` |
| `.env.vps.example` | VPS — `cp .env.vps.example .env` |

## Fluxo resumido

```
Desenvolvimento     →  01 + 02  (docker-compose.dev.yml)
Deploy VPS          →  03       (docker-compose.yml + Portainer)
Com dados do PC     →  03 Passo 7 + 07  (backup-local.ps1 → restore-on-vps.sh)
Manutenção          →  04
```

> Se já usa o sistema localmente, **não pule a migração (07)** — sem ela a VPS sobe vazia.
