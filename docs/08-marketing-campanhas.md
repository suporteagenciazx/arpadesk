# 08 — Marketing: Campanhas

Módulo **Marketing** para captar, salvar e analisar disparos (SMS/WhatsApp) por semana operacional, alinhado ao calendário e fechamento do **financeiro do mesmo projeto**.

> AGENCIA: marketing habilitado por padrão no seed. Calendário seg–sex, semana aberta e fechamento de caixa são os mesmos do financeiro.

---

## Regras de negócio

| Regra | Detalhe |
|-------|---------|
| **Habilitar projeto** | `projects.settings.marketing_config.enabled` — só projetos habilitados aparecem em `/marketing` |
| **Calendário** | Mesma semana operacional do financeiro (seg–sex, `active_period`, fechamentos) |
| **Linha da tabela** | Uma linha por semana com atividade (fechamento, relatório salvo ou listas de marketing) |
| **Clientes recebidos** | Informado no **fechamento de caixa** ou **salvar relatório**; se omitido, fica em branco e pode editar depois no Marketing |
| **Faturamento / lucro** | Calculados via `compute_summary` — mesma fonte do Relatório (não duplicados) |
| **Investimento** | Toggle UI: despesas `DIVULGACAO` ou despesas gerais da semana |
| **Listas** | N disparos por semana (SMS/WhatsApp); cada disparo tem N listas com anexo opcional (MinIO) |

---

## Onde está no código

| Camada | Arquivo |
|--------|---------|
| Config projeto | `backend/app/services/project_marketing_config.py` |
| Semanas agregadas | `backend/app/services/marketing_weeks.py` |
| Listas / disparos | `backend/app/services/marketing_lists.py` |
| API | `backend/app/routers/marketing.py` |
| Modelos | `MarketingDispatch`, `MarketingList`, `CashClosing.clients_received` |
| Frontend galeria | `frontend/src/pages/marketing/MarketingProjects.jsx` |
| Frontend aba | `frontend/src/pages/marketing/Campanhas.jsx` |
| Clientes no financeiro | `Vendas.jsx` (fechamento), `SaveReportModal.jsx` (salvar relatório) |

---

## API

Prefixo: `/api/projects/{id}/marketing`

| Método | Rota | Descrição |
|--------|------|-----------|
| GET | `/config` | Config marketing do projeto |
| PATCH | `/config` | Habilitar/desabilitar (admin) |
| GET | `/weeks?expense_mode=marketing\|all` | Tabela Campanhas |
| PATCH | `/weeks/clients-received` | Editar clientes recebidos |
| GET | `/weeks/lists?period_start=&period_end=` | Listas da semana |
| POST | `/weeks/lists` | Nova lista |
| PATCH | `/lists/{id}` | Atualizar lista |
| DELETE | `/lists/{id}` | Excluir lista |
| POST | `/lists/{id}/attachment` | Upload anexo |
| GET | `/lists/{id}/attachment/download` | Download anexo |

**Fechamento / relatório** (financeiro):

- `POST /api/projects/{id}/cash-closing` — body opcional `{ "clients_received": 123 }`
- `POST /api/projects/{id}/report-save` — body opcional `{ "clients_received": 123 }`

---

## Habilitar marketing (admin)

```bash
curl -X PATCH https://DOMINIO/api/projects/1/marketing/config \
  -H "Authorization: Bearer TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"enabled": true}'
```

Ou via seed: projeto AGENCIA já nasce com `marketing_config.enabled: true`.

---

## Fases implementadas

- [x] Fase 1 — Sidebar, rotas, galeria, config por projeto
- [x] Fase 2 — Tabela Campanhas (métricas do financeiro + clientes recebidos)
- [x] Fase 3 — CRUD listas, upload anexo, modal Listas
- [ ] Fase 4 — Resumo mensual, export CSV (futuro)

---

## Não-regressão financeiro

O Marketing **não altera** `active_period`, `report_tabs_locked`, overlay CAIXA FECHADO nem fluxo de save do relatório — apenas **lê** períodos existentes e grava `clients_received` no `CashClosing` quando informado.
