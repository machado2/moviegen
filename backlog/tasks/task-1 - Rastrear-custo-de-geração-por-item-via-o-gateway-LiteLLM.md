---
id: TASK-1
title: Rastrear custo de geração por item via o gateway LiteLLM
status: Done
assignee:
  - '@claude'
created_date: '2026-06-25 13:53'
updated_date: '2026-06-25 14:27'
labels:
  - backend
  - frontend
  - custo
dependencies: []
references:
  - docs/ux-spec.md
  - backend/src/services/ai.ts
  - backend/src/comics/services/ai.ts
  - frontend/src/components/Estudio.tsx
priority: high
ordinal: 1000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
O gateway LiteLLM (OpenAI-compatible) retorna 'usage' (tokens) em cada completion e pode expor custo. A filosofia do 'freio de gasto' da spec (docs/ux-spec.md §13) pede o custo real sempre visível e um teto configurável com pausa automática. Hoje o Estúdio só mostra 'N gerados nesta sessão' + rate-limit, sem R$/$ real.

Resultado: capturar usage/custo de cada chamada de LLM (parse e geração de prompt de imagem; e geração de imagem quando houver custo), acumular por projeto, expor via API e mostrar no Estúdio, mais um teto que pausa o modo API ao atingir o limite.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Backend captura 'usage' (e custo quando presente) das respostas do gateway e persiste um total acumulado por projeto
- [x] #2 O Estúdio (cabeçalho e painel do modo API) mostra o custo acumulado da sessão e, quando conhecido, o custo por item
- [x] #3 Um teto de gasto configurável pausa automaticamente a geração no modo API ao ser atingido
- [x] #4 Custo nunca é inventado: mostra '—' quando o gateway não retornou custo
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. spend.ts: ledger por projeto (spend.ncl) — recordSpend/getSpend (best-effort).
2. chat() (filme+HQ) retorna {content, costUsd, tokens}: custo do header x-litellm-response-cost, tokens de usage (HQ: stream_options.include_usage).
3. Callers (parseScript/parseComicsScript/generateImagePrompt) gravam o spend; cap-check antes da chamada.
4. settings: spendCapUsd; routes: GET /projects/:id/spend (filme+HQ); types: SpendDTO + AppSettingsDTO.spendCapUsd.
5. Frontend: client.spend/update; Pipeline + Estúdio mostram custo de IA do projeto; SettingsPanel ganha teto. Custo de imagem (codex) fica '—' (honesto).
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implementado: services/spend.ts (ledger spend.ncl por projeto, best-effort, nunca bloqueia geração). chat() (filme e HQ) agora retorna {content, spend} — custo do header x-litellm-response-cost (null quando ausente), tokens de usage (HQ streaming usa stream_options.include_usage). parseScript/generateImagePrompt/parseComicsScript gravam spend e fazem cap-check (assertUnderCap → HTTP 402) antes da chamada. settings ganhou spendCapUsd (normalizado); GET /projects/:id/spend (filme e HQ). Frontend: SpendDTO, client.projects.spend, lib/cost (formatUsd/spendLabel mostram '—' quando hasCost=false), useSpend, SettingsPanel com teto, Pipeline e Estúdio mostram custo IA do projeto + teto, Estúdio pausa o modo API ao atingir o teto e mostra custo do último item. Custo de imagem via codex permanece '—'. Verificado: pnpm typecheck e pnpm build passam.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Captura usage/custo do gateway LiteLLM por chamada, acumula em spend.ncl por projeto, expõe em GET /projects/:id/spend e mostra no Pipeline e no Estúdio (cabeçalho + painel do modo API, com custo por item quando conhecido). Teto global (spendCapUsd) pausa o modo API e bloqueia chamadas pagas (HTTP 402) ao ser atingido. Custo nunca é inventado: '—' quando o gateway não reporta. Verificado com pnpm typecheck + pnpm build.
<!-- SECTION:FINAL_SUMMARY:END -->
