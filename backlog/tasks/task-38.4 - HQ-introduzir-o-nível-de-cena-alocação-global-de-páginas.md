---
id: TASK-38.4
title: 'HQ: introduzir o nível de ''cena'' + alocação global de páginas'
status: To Do
assignee: []
created_date: '2026-06-27 23:48'
updated_date: '2026-06-28 17:45'
labels:
  - pipeline
  - backend
  - comics
dependencies:
  - TASK-38.1
parent_task_id: TASK-38
priority: medium
ordinal: 51000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Hoje HQ vai direto roteiro → pranchas → quadros (2 níveis), sem equivalente a 'cena'. Introduzir a mesma camada de cena crua do filme na HQ (a HQ também é narrativamente feita de cenas; página/painel é diagramação = produção). Assim os dois pipelines ficam simétricos na extração.

Assimetria a resolver: no filme, shots são escopados dentro da cena (transformar fora de ordem é inócuo); na HQ, páginas são uma sequência GLOBAL — transformar a cena 3 antes da 2 escorrega a numeração de pranchas. Definir estratégia de alocação de páginas (ex.: renumerar pranchas após cada transform, ou cada cena reserva um intervalo).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 HQ ganha camada de cena crua análoga à do filme (TASK-38.1)
- [ ] #2 Existe estratégia definida de alocação/numeração global de páginas ao transformar cenas fora de ordem
- [ ] #3 A numeração de pranchas permanece consistente após transformar cenas em qualquer ordem
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
DECISÃO (usuário): NÃO usar número de página em lugar nenhum — a paginação (quais quadros caem em qual prancha) é determinada SÓ na montagem final da revista. Assim a 'numeração global de páginas' deixa de ser um problema: a camada de cena produz quadros/sequências sem número de prancha; pranchas/páginas são derivadas no fim. Reavaliar o uso atual de prancha.number à luz disso quando implementar. ADIADO por orientação do usuário (não implementar HQ agora).
<!-- SECTION:NOTES:END -->
