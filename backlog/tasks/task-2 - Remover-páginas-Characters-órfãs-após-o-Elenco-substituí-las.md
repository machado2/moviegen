---
id: TASK-2
title: Remover páginas Characters órfãs após o Elenco substituí-las
status: Done
assignee:
  - '@claude'
created_date: '2026-06-25 13:53'
updated_date: '2026-06-25 14:27'
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
- [x] #1 As páginas Characters sem uso são removidas (ou sua funcionalidade única — ex.: slot de voz do filme — é movida para Elenco/Assets antes)
- [x] #2 Sem imports mortos; typecheck e build passam
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
A funcionalidade única do Characters do filme (slot de áudio de voz) já é coberta pela aba Assets (lista todos os assets, inclusive type=audio/role=voice, com upload/generate/download), então nenhuma migração foi necessária — apenas remoção. Removidos: frontend/src/pages/Characters.tsx, frontend/src/pages/comics/Characters.tsx e frontend/src/components/CharacterCard.tsx (este só era importado pela página removida). Sem imports mortos restantes. Verificado: pnpm typecheck e pnpm build passam.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Removidas as páginas Characters órfãs (filme e HQ) e o CharacterCard, já substituídos pela visão Elenco & Cenários; o slot de voz continua disponível na aba Assets. Sem imports mortos; typecheck e build passam.
<!-- SECTION:FINAL_SUMMARY:END -->
