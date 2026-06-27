---
id: TASK-24
title: >-
  Red-team UX: teto de gasto vira teto de verdade (estimativa + concorrência +
  fail-closed)
status: Done
assignee: []
created_date: '2026-06-27 20:37'
updated_date: '2026-06-27 22:10'
labels:
  - redteam
  - safety
  - backend
  - money
dependencies: []
priority: high
ordinal: 33000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
assertUnderCap só checa ledger já gravado: chamada cara única e rajada concorrente passam e estouram N× o teto; jobs rodam sem limite de concorrência; ledger é best-effort e fail-open (corrompeu->zera->cap nunca dispara). Tornar o teto real: estimar/reservar custo antes, serializar/limitar geração por projeto, e fail-closed quando o ledger não for legível/gravável.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Geração é bloqueada quando prior + estimativa excederia o teto (não só quando o ledger já passou)
- [ ] #2 Rajada de cliques não ultrapassa o teto por concorrência (lock/serialização por projeto)
- [ ] #3 Falha de leitura/escrita do ledger bloqueia geração paga (fail-closed) e loga aviso visível
<!-- AC:END -->
