---
id: TASK-31
title: 'Red-team UX: limpar EventSource do parse (vazamento de SSE)'
status: Done
assignee: []
created_date: '2026-06-27 20:38'
updated_date: '2026-06-27 20:47'
labels:
  - redteam
  - frontend
  - bug
dependencies: []
priority: high
ordinal: 40000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
trackParse descarta o unsubscribe de subscribeJob; sair da aba/projeto deixa EventSource zumbi e re-attach empilha streams duplicando autoApply. Guardar o unsub e limpar no cleanup do effect; encerrar stream anterior antes de re-subscrever. Filme e HQ.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 EventSource do parse é encerrado ao desmontar/trocar de aba/projeto
- [ ] #2 Não há múltiplos streams simultâneos para o mesmo parse (re-subscribe encerra o anterior)
<!-- AC:END -->
