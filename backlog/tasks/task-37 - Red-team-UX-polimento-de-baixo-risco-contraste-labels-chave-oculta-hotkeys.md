---
id: TASK-37
title: >-
  Red-team UX: polimento de baixo risco (contraste, labels, chave oculta,
  hotkeys)
status: Done
assignee: []
created_date: '2026-06-27 20:39'
updated_date: '2026-06-27 22:12'
labels:
  - redteam
  - a11y
  - ux
  - frontend
dependencies: []
priority: low
ordinal: 46000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Lote de baixa severidade: badge amber/branco ~1.7:1 ilegível -> foreground escuro; select de modelo no header sem label/aria-label; chave de API em type=text -> type=password com toggle; documentar hotkeys (c=copiar prompt) e revisar a tecla única sem modificador; fullscreen do resultado só-hover; export espalhado; limpar timer de blur do ModelCombobox no unmount.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Badges atingem contraste AA; select de modelo no header com label/aria-label
- [ ] #2 Campo de chave de API oculto (password) com toggle de revelar
- [ ] #3 Hotkeys documentados; timer de blur limpo no unmount
<!-- AC:END -->
