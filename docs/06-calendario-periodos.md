# 06 — Calendário e filtros de período

Referência da **semana operacional** e dos presets de data usados no financeiro (Vendas, Despesas, Comissões, Pagamentos, Relatório).

## Regra de negócio

| Conceito | Definição |
|----------|-----------|
| **Semana operacional** | Segunda a sexta da **semana civil** (ISO 8601: semana começa na segunda) |
| **Preset "Atual"** | Semana operacional que contém o dia de hoje |
| **Fim de semana** | Sábado e domingo continuam na mesma semana civil (ex.: sáb 20/06 → seg–sex 15–19/06) |
| **Comparação no relatório** | Semana atual (seg–sex completa) vs semana anterior (seg–sex) |

Exemplo (terça **16/06/2026**):

- Período correto: **15/06 (seg) — 19/06 (sex)**
- Semana ISO: **25/2026**

## Onde está no código

| Camada | Arquivo | Função |
|--------|---------|--------|
| Frontend (fonte da verdade UI) | `frontend/src/lib/calendar.js` | `getOperationalWeekRange`, `toLocalIso`, `shiftOperationalWeek` |
| Hook React | `frontend/src/hooks/useDateFilter.js` | Estado do filtro + navegação ‹ › semana |
| UI | `frontend/src/components/DateFilterBar.jsx` | Chips de preset + navegador de semana |
| UI | `frontend/src/components/PeriodHint.jsx` | Exibe período e badge `Semana N/AAAA` |
| Backend (relatório) | `backend/app/services/calendar.py` | Mesma regra para `week_comparison` |
| Backend (cálculos) | `backend/app/services/finance.py` | Usa `operational_week_range()` |

> **Importante:** filtros de dia usam `toLocalIso()` (data civil no fuso do navegador). **Nunca** use `Date.toISOString().slice(0,10)` — em horários noturnos no Brasil isso desloca um dia e gerava intervalos errados (ex.: 16–20 em vez de 15–19).

## Presets disponíveis

| ID | Label | Intervalo |
|----|-------|-----------|
| `atual` | Atual | Seg–sex da semana civil atual |
| `today` | Hoje | Apenas hoje |
| `7d` | Últimos 7 dias | Hoje − 6 dias até hoje |
| `15d` | Últimos 15 dias | Hoje − 14 dias até hoje |
| `month` | Mês | 1º dia do mês até hoje |
| `6m` | Últimos 6 meses | Mesma data − 6 meses até hoje |
| `custom` | Personalizado | Datas escolhidas pelo usuário |

## Navegação de semanas

Quando o intervalo selecionado é uma semana operacional (seg–sex, 5 dias), aparecem setas **‹ ›** com o rótulo `Semana N/AAAA`. Cada clique desloca ±7 dias. O botão **Atual** volta para a semana civil corrente.

## Fechamento de caixa (Vendas)

| Regra | Detalhe |
|-------|---------|
| Quem vê | Admin, financeiro, contador |
| Disponibilidade | Segunda a sexta, até **20:00** da sexta (horário local) |
| Filtro de período | Financeiro e contador ficam travados no preset **Atual** (sem chips de data) |
| Conteúdo do modal | Lista de vendas da semana + **FATURAMENTO FINAL** (soma de todos os valores) |

Função: `isCashClosingAvailable()` em `frontend/src/lib/calendar.js`.

## Multas por período

Multas registradas em **Vendas → Adicionar multa** são salvas em `period_fines` (API `POST /api/projects/{id}/fines`) e aparecem na coluna **Multas** em Pagamentos.

| Campo | Descrição |
|-------|-----------|
| `participant_id` | Gerente que receberá o desconto |
| `period_start` / `period_end` | Mesmo intervalo do filtro (semana atual) |
| `amount` | Valor da multa |
| `notes` | Observações |

Uma multa por gerente por período (novo registro substitui o anterior).

## API — parâmetros de período

Endpoints que aceitam filtro:

- `GET /api/projects/{id}/sales?period_start=&period_end=`
- `GET /api/projects/{id}/expenses?...`
- `GET /api/projects/{id}/summary?...`
- `GET /api/projects/{id}/report?...`
- `GET /api/projects/{id}/payments/commissions?...`

Formato: `YYYY-MM-DD` (ISO 8601, sem hora).

## Validar após alterações

```powershell
# Frontend — casos fixos (inclui simulação de horário noturno)
node frontend/src/lib/calendar.validate.mjs

# Backend — semana operacional
cd backend
python -c "from datetime import date; from app.services.calendar import operational_week_range; s,e=operational_week_range(date(2026,6,16)); assert s.isoformat()=='2026-06-15' and e.isoformat()=='2026-06-19'; print('OK', s, e)"
```

## Checklist manual (UI)

1. Abrir qualquer aba financeira com preset **Atual**.
2. Confirmar período **seg–sex** da semana corrente (não deslocado +1 dia).
3. Usar ‹ › e verificar que cada passo move exatamente 7 dias.
4. Clicar **Atual** e voltar à semana corrente.
5. No Relatório, conferir card "vs semana passada" com base na semana seg–sex completa.
