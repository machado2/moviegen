---
id: TASK-38.1
title: >-
  Extração: segmentar roteiro em cenas cruas + persistir a prosa original
  (procedência)
status: To Do
assignee: []
created_date: '2026-06-27 23:48'
labels:
  - pipeline
  - backend
  - film
dependencies: []
parent_task_id: TASK-38
priority: medium
ordinal: 48000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Hoje a prosa original da cena não é guardada: depois que o parse explode em shots, ela só existe no script.md monolítico. Introduzir uma camada de CENA CRUA, extraída fielmente do roteiro (que já costuma vir separado em cenas por cabeçalhos INT./EXT.), com pouca/nenhuma criatividade — etapa barata e re-rodável.

Escopo (filme primeiro): uma etapa/ferramenta de extração que produz uma lista ordenada de cenas cruas {número, cabeçalho/slug, prosa original verbatim, personagens presentes} e persiste isso (preferência: camada própria scenes-raw/<n>.ncl com ponteiro de procedência, em vez de campo solto na Scene). Não explodir em shots aqui — isso é a etapa de transformação (outra tarefa).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Roteiro é segmentado em cenas cruas ordenadas, com a prosa original preservada verbatim
- [ ] #2 Cena crua guarda número, cabeçalho/slug, texto original e personagens presentes
- [ ] #3 Persistência define claramente o que é fonte (cru) vs derivado, com procedência rastreável
- [ ] #4 A extração não explode shots (separada da transformação)
<!-- AC:END -->
