---
id: TASK-23
title: 'Red-team UX: gate de configuração na primeira execução (chave do gateway)'
status: To Do
assignee: []
created_date: '2026-06-27 20:37'
labels:
  - ux
  - redteam
  - frontend
dependencies: []
priority: high
ordinal: 32000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Sem chave do gateway, o parse falha numa linha vermelha sem dizer que precisa de chave nem onde configurar (engrenagem global sem rótulo). Surfacar pré-condição: banner em Pipeline/Overview quando !settings.hasApiKey com deep-link para Configurações; desabilitar Parsear/Gerar com motivo inline em vez de deixar falhar.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Banner/aviso visível quando não há chave do gateway, com link que abre Configurações
- [ ] #2 Parsear e Gerar ficam desabilitados com motivo inline (não só tooltip) quando falta pré-condição (chave/modelo)
<!-- AC:END -->
