---
id: TASK-5
title: 'Estúdio: seletor de prancha/cena para enxugar a fila gigante'
status: Done
assignee:
  - '@claude'
created_date: '2026-06-25 15:06'
updated_date: '2026-06-25 17:10'
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
- [x] #1 O Estúdio tem um seletor de prancha (HQ) / cena (filme); a fila mostra referências + só as unidades do grupo selecionado
- [x] #2 O modo API gera dentro do grupo selecionado (uma prancha/cena por vez)
- [x] #3 Navegação e contadores refletem o escopo selecionado; typecheck e build passam
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
StudioItem ganhou group {id,label,order} (cena no filme, prancha na HQ). useStudioQueue popula group em shots/quadros. Estúdio: seletor de grupo (mostra 'Todas (N)' + cada cena/prancha); a fila, contadores, navegação e o loop de API operam só sobre referências + grupo selecionado. Default = grupo do item focado, senão o primeiro; references (sem group) sempre visíveis. Typecheck e build OK.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Estúdio agora tem um seletor de prancha/cena que enxuga a fila: mostra as referências + só as unidades do grupo selecionado, e o modo API produz um grupo por vez. Referências sempre visíveis.
<!-- SECTION:FINAL_SUMMARY:END -->
