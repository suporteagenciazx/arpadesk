# Documentação Arpadesk

Índice dos guias operacionais do repositório.

| Doc | Conteúdo |
|-----|----------|
| [00-organizacao-repositorio.md](./00-organizacao-repositorio.md) | Estrutura de pastas e convenções de código |
| [01-setup-dev-local.md](./01-setup-dev-local.md) | Pré-requisitos Windows e primeiro run local |
| [02-docker-local.md](./02-docker-local.md) | Compose de desenvolvimento, comandos e troubleshooting |
| [03-deploy-vps.md](./03-deploy-vps.md) | Deploy na VPS (SSH + Portainer) e diferenças local → produção |
| [04-manutencao-backup.md](./04-manutencao-backup.md) | Backup PostgreSQL, volumes, updates |
| [05-variaveis-ambiente.md](./05-variaveis-ambiente.md) | Referência completa de variáveis `.env` |
| [PLANO-MVP.md](./PLANO-MVP.md) | Plano de produto (financeiro, suporte, kanban, RBAC) |

## Fluxo recomendado

1. Leia **00** e **01** antes de codar.
2. Use **02** no dia a dia local (`docker-compose.dev.yml`).
3. Antes de subir na VPS, leia **03** e **05** — especialmente a tabela local vs produção.
4. Configure backup conforme **04** assim que staging estiver no ar.
