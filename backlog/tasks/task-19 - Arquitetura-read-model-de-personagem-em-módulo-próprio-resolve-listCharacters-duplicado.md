---
id: TASK-19
title: >-
  Arquitetura: read-model de personagem em módulo próprio (resolve
  listCharacters duplicado)
status: Done
assignee: []
created_date: '2026-06-26 14:36'
updated_date: '2026-06-26 14:37'
labels: []
dependencies: []
ordinal: 28000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
A derivação de Character a partir dos assets vivia misturada no asset.ts, e o filme tinha dois listCharacters conflitantes (um rico em asset.ts, um leve em character.ts). Consolidar num módulo de read-model por stack.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 deriveCharacters/listCharacters/getCharacter movidos do asset.ts para character.ts (filme) e comics/services/character.ts (HQ)
- [x] #2 O listCharacters leve (contexto do agente) vira characterContext; importadores atualizados
- [x] #3 asset.ts (filme e HQ) deixa de exportar derivação; imports órfãos removidos; build verde e comportamento idêntico
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Filme: deriveCharacters/listCharacters(projectId)/getCharacter movidos asset.ts→character.ts; o listCharacters(project) leve renomeado para characterContext (usado por cocreateAgent). routes/characters.ts e cocreateAgent.ts atualizados. HQ: criado comics/services/character.ts (mesma extração); comics/routes/characters.ts atualizado. Imports órfãos (Character/Project/slugify) removidos dos asset.ts. Validado: build verde, servidor sobe sem ciclo de import, e deriveCharacters/characterContext produzem saída correta (teste direto na dist).
<!-- SECTION:NOTES:END -->
