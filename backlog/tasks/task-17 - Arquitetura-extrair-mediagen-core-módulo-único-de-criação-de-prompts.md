---
id: TASK-17
title: 'Arquitetura: extrair @mediagen/core (módulo único de criação de prompts)'
status: Done
assignee: []
created_date: '2026-06-26 13:58'
updated_date: '2026-06-26 13:59'
labels: []
dependencies: []
ordinal: 26000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
O conhecimento de criação de prompts estava triplicado (frontend monta+envia, backend tem fallback, e ainda o LLM). Consolidar num package puro compartilhado, primeiro passo do rumo clean-code de 'um módulo por responsabilidade'.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Novo package @mediagen/core (puro, depende só de @mediagen/types) com todos os builders de prompt
- [x] #2 Frontend e backend importam do core; builders duplicados removidos (lib/prompt.ts e comics/services/prompt.ts deletados)
- [x] #3 Wiring de build/runtime: workspace, dep na raiz (hoist), ordem de build, Dockerfile (builder+runtime), lockfile
- [x] #4 Cadeia compila (types→core→backend→frontend) e o dist/server.js resolve @mediagen/core em runtime
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Criado packages/core com prompts/{text,film,comics}: dot(), filmReferencePrompt, shotPrompt, comicsCharacterPrompt, quadroPrompt, quadroAttachmentIds. Backend: shotgen/assetgen/comics assembly/quadros route usam o core; removidos fallbacks inline e comics/services/prompt.ts. Frontend: useStudioQueue/ShotCard usam o core; removido lib/prompt.ts. Wiring: pnpm-workspace +packages/core, dep workspace em backend/frontend e na raiz (p/ hoist ao node_modules raiz), ordem de build types→core→backend→frontend, Dockerfile copia packages/core/{package.json,dist}. Validado: typecheck dos 4 pacotes, build, e runtime (dist/server.js sobe + funções do core produzem saída idêntica). Doc: docs/ARCHITECTURE.md com mapa de responsabilidades; próximo módulo = camada de persistência/formato.
<!-- SECTION:NOTES:END -->
