---
id: TASK-39
title: Adicionar exclusão de projeto
status: Done
assignee:
  - '@codex'
created_date: '2026-06-28 18:03'
updated_date: '2026-06-28 18:07'
labels: []
dependencies: []
modified_files:
  - frontend/src/components/ProjectList.tsx
priority: medium
ordinal: 55000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Usuários conseguem excluir um projeto pela interface, com confirmação, feedback imediato e remoção persistente dos dados do projeto.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 A lista/detalhe de projetos oferece uma ação clara para excluir um projeto
- [x] #2 A exclusão exige confirmação antes de remover dados
- [x] #3 A UI mostra feedback em até 100ms enquanto a exclusão está em andamento
- [x] #4 Após sucesso, o projeto excluído desaparece da UI e não fica acessível
- [x] #5 Falhas de exclusão são exibidas sem deixar a UI em estado inconsistente
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Mapear storage/rotas de projetos e fluxo atual da lista de projetos.\n2. Adicionar API de exclusão persistente no backend, reaproveitando as primitivas de storage existentes.\n3. Expor a chamada no client/frontend e adicionar ação de exclusão com confirmação, feedback imediato e tratamento de erro.\n4. Rodar checks relevantes e atualizar critérios de aceite da task.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented project deletion in the project list UI using the existing film and comics DELETE APIs. Added confirmation dialog, per-row pending state, spinner feedback before awaiting the request, reload after success, and visible error handling on failure.

Validation passed: pnpm --filter @mediagen/frontend typecheck; pnpm --filter @mediagen/frontend build; pnpm --filter @mediagen/backend build. Could not start a dev server in this sandbox because listening on both 0.0.0.0:3000 and 127.0.0.1:3000 returned EPERM.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Added project deletion to the project list UI for film and comics projects. The feature uses the existing DELETE APIs, requires confirmation, shows immediate spinner feedback, refreshes the list after success, and surfaces failures in the dialog.
<!-- SECTION:FINAL_SUMMARY:END -->
