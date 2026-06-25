---
id: TASK-6
title: 'UI de geração reutilizável (modal) a partir de Pranchas, Storyboard e Elenco'
status: To Do
assignee: []
created_date: '2026-06-25 15:07'
labels:
  - frontend
  - ux
dependencies: []
priority: medium
ordinal: 6000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
As outras telas devem abrir a MESMA UI de geração do Estúdio (prompt + colar/arrastar/gerar por API + anexos) num modal, em vez de fluxos separados (ex.: QuadroCard hoje tem geração própria). Extrair o 'workbench' de um item do Estúdio para um componente reutilizável e abri-lo num modal a partir dos cards. Refs: frontend/src/components/Estudio.tsx, frontend/src/components/comics/QuadroCard.tsx, frontend/src/pages/comics/Pranchas.tsx, frontend/src/components/Storyboard.tsx, frontend/src/components/ElencoCenarios.tsx.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 O workbench de geração de um item é um componente reutilizável compartilhado pelo Estúdio e por um modal
- [ ] #2 Pranchas, Storyboard e Elenco têm um botão 'Gerar' que abre esse modal para o item, sem sair da tela
- [ ] #3 Salvar/gerar no modal atualiza a tela de origem; typecheck e build passam
<!-- AC:END -->
