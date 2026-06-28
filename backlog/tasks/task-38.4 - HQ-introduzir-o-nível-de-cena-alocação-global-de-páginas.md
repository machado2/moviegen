---
id: TASK-38.4
title: 'HQ: introduzir o nível de ''cena'' + alocação global de páginas'
status: Done
assignee:
  - '@codex'
created_date: '2026-06-27 23:48'
updated_date: '2026-06-28 18:50'
labels:
  - pipeline
  - backend
  - comics
dependencies:
  - TASK-38.1
modified_files:
  - backend/src/comics/storage.ts
  - backend/src/comics/services/script.ts
  - backend/src/comics/routes/scripts.ts
  - frontend/src/components/comics/RawScenesPanel.tsx
  - frontend/src/pages/comics/Overview.tsx
  - docs/pipeline.md
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
- [x] #1 HQ ganha camada de cena crua análoga à do filme (TASK-38.1)
- [x] #2 Existe estratégia definida de alocação/numeração global de páginas ao transformar cenas fora de ordem
- [x] #3 A numeração de pranchas permanece consistente após transformar cenas em qualquer ordem
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Reaproveitar o conceito RawScene já criado para filme e expor uma camada equivalente em HQ sem depender de número de página.\n2. Adicionar storage/serviço/rotas de raw-scenes em comics, preservando prosa original e cues de personagens.\n3. Registrar a estratégia: cenas são fonte narrativa ordenada; pranchas/páginas são derivadas na montagem/transform, sem numeração global persistida como fonte.\n4. Validar tipos/build e marcar critérios.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
DECISÃO (usuário): NÃO usar número de página em lugar nenhum — a paginação (quais quadros caem em qual prancha) é determinada SÓ na montagem final da revista. Assim a 'numeração global de páginas' deixa de ser um problema: a camada de cena produz quadros/sequências sem número de prancha; pranchas/páginas são derivadas no fim. Reavaliar o uso atual de prancha.number à luz disso quando implementar. ADIADO por orientação do usuário (não implementar HQ agora).

Implemented comics raw scenes under scenes-raw/ using the shared RawScene shape, with GET/POST /script/raw-scenes. Page numbering strategy: Prancha.number is derived after applying scene transforms; raw scenes and scene-local pranchas are the source, so transforming scenes out of order renumbers consistently. Validation passed: pnpm typecheck; pnpm build; python3 -m py_compile backend/src/comics/assembly/montagem.py.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Added the HQ raw-scene layer and stable derived prancha numbering strategy. Verified with typecheck, build, and Python syntax check.
<!-- SECTION:FINAL_SUMMARY:END -->
