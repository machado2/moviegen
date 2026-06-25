---
id: TASK-2
title: Remover páginas Characters órfãs após o Elenco substituí-las
status: To Do
assignee: []
created_date: '2026-06-25 13:53'
labels:
  - frontend
  - limpeza
dependencies: []
references:
  - frontend/src/components/ElencoCenarios.tsx
  - frontend/src/pages/Characters.tsx
priority: low
ordinal: 2000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
A visão 'Elenco & Cenários' (ElencoCenarios) substituiu a aba Characters nos dois apps. frontend/src/pages/Characters.tsx e pages/comics/Characters.tsx (e CharacterCard) saíram da navegação mas continuam na árvore. Decidir: apagar, ou primeiro mover o que ainda é útil (no filme, o slot de asset de voz) para o Elenco/Assets e então remover.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 As páginas Characters sem uso são removidas (ou sua funcionalidade única — ex.: slot de voz do filme — é movida para Elenco/Assets antes)
- [ ] #2 Sem imports mortos; typecheck e build passam
<!-- AC:END -->
