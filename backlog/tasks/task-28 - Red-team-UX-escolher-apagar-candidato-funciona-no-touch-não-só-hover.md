---
id: TASK-28
title: 'Red-team UX: escolher/apagar candidato funciona no touch (não só hover)'
status: To Do
assignee: []
created_date: '2026-06-27 20:38'
labels:
  - redteam
  - a11y
  - frontend
dependencies: []
priority: high
ordinal: 37000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Na galeria de candidatos, clique abre fullscreen e as ações 'Usar esta'/apagar ficam em painel opacity-0 group-hover -> no touch não dá pra escolher nem apagar. Tornar seleção um clique e ações sempre visíveis; fullscreen num ícone dedicado.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Um clique/tap seleciona o candidato; 'Usar esta' e apagar sempre acessíveis (não só hover)
- [ ] #2 Fullscreen tem affordance própria e visível, consistente entre candidato e resultado
<!-- AC:END -->
