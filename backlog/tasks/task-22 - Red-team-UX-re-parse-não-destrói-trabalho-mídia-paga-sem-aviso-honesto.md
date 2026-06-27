---
id: TASK-22
title: 'Red-team UX: re-parse não destrói trabalho/mídia paga sem aviso honesto'
status: To Do
assignee: []
created_date: '2026-06-27 20:37'
labels:
  - ux
  - redteam
  - safety
  - frontend
dependencies: []
priority: high
ordinal: 31000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
O re-parse reconstrói project.scenes do zero (novos ids), descartando cenas/shots e tomadas pagas; o diálogo só fala de custo. Pior: parse pendente auto-aplica no load da página sem clique. Corrigir: diálogo honesto ('substitui a estrutura atual e descarta tomadas geradas; uma versão fica no Histórico') quando já há cenas; aplicar parse pendente só via ação explícita do usuário.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Quando o projeto já tem cenas, o diálogo de confirmação avisa explicitamente que a estrutura atual e as tomadas geradas serão substituídas
- [ ] #2 Parse pendente (finished-but-unapplied) não auto-aplica no mount; vira card 'Aplicar resultado' que exige clique
- [ ] #3 Vale para filme (Overview) e HQ (comics/Overview)
<!-- AC:END -->
