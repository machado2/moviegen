---
id: TASK-35
title: 'Red-team UX: viewer fullscreen como Dialog acessível'
status: Done
assignee: []
created_date: '2026-06-27 20:39'
updated_date: '2026-06-27 21:12'
labels:
  - redteam
  - a11y
  - frontend
dependencies: []
priority: medium
ordinal: 44000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Viewer fullscreen é overlay fixed inset-0 caseiro: sem role=dialog/aria-modal, sem focus-trap/restore; Tab cicla a página atrás; hotkeys de fila (setas) ainda agem atrás do overlay. Reusar o Radix Dialog (que o resto do app já usa) ou adicionar focus-trap/restore + aria-modal; suprimir hotkeys da fila com o viewer aberto.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Viewer usa Dialog acessível (focus-trap, restore de foco, aria-modal)
- [ ] #2 Hotkeys da fila não agem enquanto o viewer está aberto
<!-- AC:END -->
