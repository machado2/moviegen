---
id: TASK-38.5
title: 'HQ: transform por cena (cena → quadros + layout)'
status: Done
assignee:
  - '@codex'
created_date: '2026-06-27 23:49'
updated_date: '2026-06-28 18:50'
labels:
  - pipeline
  - backend
  - comics
dependencies:
  - TASK-38.4
modified_files:
  - packages/types/src/comics.ts
  - backend/src/comics/services/transformAgent.ts
  - backend/src/comics/services/script.ts
  - backend/src/comics/routes/scripts.ts
  - frontend/src/api/comicsClient.ts
  - frontend/src/components/comics/RawScenesPanel.tsx
parent_task_id: TASK-38
priority: medium
ordinal: 52000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Análogo da transformação do filme, mas com a sub-decisão extra da HQ: além de quebrar a cena em quadros, decidir o layout (quantos painéis, como empacotar em páginas/slots). O slotFormatFor determinístico (backend/src/comics/layout.ts) segue resolvendo o aspecto do slot depois que o layout é escolhido.

Por cena, sob demanda, re-rodável, com contexto de elenco/lugares; idealmente candidatos de breakdown/layout.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Transformar uma cena de HQ gera seus quadros + layout das pranchas sem reprocessar o roteiro inteiro
- [x] #2 slotFormat continua derivado do layout (não escolhido pelo modelo)
- [x] #3 Re-transformar preserva renders já feitos dos quadros mantidos
- [x] #4 Suporta candidatos de breakdown/layout da cena
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Criar agente de transformação de uma cena crua de HQ para pranchas locais + quadros.\n2. Persistir candidatos ComicsSceneBreakdown em scene-breakdowns/<n> e permitir selecionar um candidato.\n3. Aplicar candidato mesclando pranchas/quadros por ordem para preservar renders existentes dos quadros mantidos.\n4. Expor client/UI no painel de cenas cruas e validar build.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
ADIADO por orientação do usuário: não implementar HQ até o pipeline (filme) estar pronto/maduro; no máximo testes descartáveis.

Implemented transformComicsSceneAgentic and scene-breakdown persistence/selection. slotFormat is always re-derived from layout via slotFormatFor. Applying a candidate merges by scene-local prancha number and quadro order, preserving selectedRenderId/renders for maintained quadros. Validation passed: pnpm typecheck; pnpm build; python3 -m py_compile backend/src/comics/assembly/montagem.py.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
HQ scenes can now be transformed on demand into candidate pranchas/quadros, selected later, with render preservation for maintained quadros. Verified with typecheck, build, and Python syntax check.
<!-- SECTION:FINAL_SUMMARY:END -->
