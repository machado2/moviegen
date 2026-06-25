---
id: TASK-5
title: 'Estúdio: seletor de prancha/cena para enxugar a fila gigante'
status: To Do
assignee: []
created_date: '2026-06-25 15:06'
labels:
  - frontend
  - ux
dependencies: []
priority: medium
ordinal: 5000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Numa HQ real a fila do Estúdio lista todos os quadros de todas as pranchas — enorme e abarrotada. Adicionar um seletor de grupo (prancha na HQ, cena no filme): mostra sempre as referências (personagens/cenários) e só as unidades do grupo selecionado; o modo API produz um grupo por vez. Refs: frontend/src/components/Estudio.tsx, frontend/src/lib/studio.ts (StudioItem), frontend/src/hooks/useStudioQueue.ts.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 O Estúdio tem um seletor de prancha (HQ) / cena (filme); a fila mostra referências + só as unidades do grupo selecionado
- [ ] #2 O modo API gera dentro do grupo selecionado (uma prancha/cena por vez)
- [ ] #3 Navegação e contadores refletem o escopo selecionado; typecheck e build passam
<!-- AC:END -->
