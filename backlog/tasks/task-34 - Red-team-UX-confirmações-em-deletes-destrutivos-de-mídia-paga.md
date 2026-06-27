---
id: TASK-34
title: 'Red-team UX: confirmações em deletes destrutivos de mídia paga'
status: To Do
assignee: []
created_date: '2026-06-27 20:39'
labels:
  - redteam
  - ux
  - frontend
  - safety
dependencies: []
priority: medium
ordinal: 43000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Apagar candidato/take/shot/asset dispara API na hora, sem confirmação (só restore confirma); lixeira encostada no 'Usar esta'. Adicionar confirmação (ou undo em sessão) para deleção de candidato/take/shot/asset e apontar o Histórico como recuperação.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Deleção de candidato/take/shot/asset pede confirmação ou oferece undo na sessão
- [ ] #2 Mensagem aponta o Histórico como caminho de recuperação quando aplicável
<!-- AC:END -->
