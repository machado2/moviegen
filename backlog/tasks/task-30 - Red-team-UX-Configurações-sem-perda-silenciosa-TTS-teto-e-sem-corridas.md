---
id: TASK-30
title: 'Red-team UX: Configurações sem perda silenciosa (TTS/teto) e sem corridas'
status: In Progress
assignee: []
created_date: '2026-06-27 20:38'
updated_date: '2026-06-27 20:40'
labels:
  - redteam
  - frontend
  - bug
dependencies: []
priority: high
ordinal: 39000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
(H8) effect sincroniza settings->campos a cada mudança, sobrescrevendo TTS/teto não-salvos quando uma lista autosalva. Inicializar campos manuais só ao abrir o painel (ou quando o próprio valor servidor muda), ou flags de dirty por campo. Tornar consistente o modelo de salvar (autosave vs manual) com indicador. Surfacar erro de carga de settings com retry. (Corridas GET/PATCH já tratadas no hook.)
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Editar TTS/teto e mexer numa lista autosalvável não descarta o valor não-salvo
- [ ] #2 Modelo de salvar consistente e sinalizado (o que autosalva vs o que exige clique; indicador de dirty)
- [ ] #3 Erro ao carregar configurações é visível com botão de retry
<!-- AC:END -->
