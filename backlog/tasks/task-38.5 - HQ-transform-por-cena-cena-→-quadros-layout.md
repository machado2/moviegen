---
id: TASK-38.5
title: 'HQ: transform por cena (cena → quadros + layout)'
status: To Do
assignee: []
created_date: '2026-06-27 23:49'
updated_date: '2026-06-28 17:45'
labels:
  - pipeline
  - backend
  - comics
dependencies:
  - TASK-38.4
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
- [ ] #1 Transformar uma cena de HQ gera seus quadros + layout das pranchas sem reprocessar o roteiro inteiro
- [ ] #2 slotFormat continua derivado do layout (não escolhido pelo modelo)
- [ ] #3 Re-transformar preserva renders já feitos dos quadros mantidos
- [ ] #4 Suporta candidatos de breakdown/layout da cena
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
ADIADO por orientação do usuário: não implementar HQ até o pipeline (filme) estar pronto/maduro; no máximo testes descartáveis.
<!-- SECTION:NOTES:END -->
