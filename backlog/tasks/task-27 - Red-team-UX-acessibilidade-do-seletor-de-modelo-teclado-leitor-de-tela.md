---
id: TASK-27
title: 'Red-team UX: acessibilidade do seletor de modelo (teclado + leitor de tela)'
status: To Do
assignee: []
created_date: '2026-06-27 20:38'
labels:
  - redteam
  - a11y
  - frontend
dependencies: []
priority: high
ordinal: 36000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
ModelCombobox: dropdown é <ul> de <button> selecionado só por onMouseDown, sem setas/Enter/Esc, sem role=listbox/option, sem aria-expanded/activedescendant. Controle central de escolha de todo modelo, inoperável sem mouse. Adicionar navegação por teclado e ARIA.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Setas navegam opções, Enter seleciona, Esc fecha; foco visível na opção ativa
- [ ] #2 role=listbox/option, aria-expanded/controls/activedescendant no input/lista
- [ ] #3 Selecionável por teclado e touch (não só onMouseDown)
<!-- AC:END -->
