---
id: TASK-10.3
title: >-
  Agente de co-criação (backend): ferramentas read/write, streaming, custo e
  cancelamento
status: To Do
assignee: []
created_date: '2026-06-26 00:43'
labels: []
dependencies:
  - TASK-10.1
  - TASK-10.2
parent_task_id: TASK-10
priority: high
ordinal: 13000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Construir o agente de co-criação sobre o Vercel AI SDK. Ferramentas: as de mutação compartilhadas com o parse (set_metadata, add/edit character, add_scene, add_shot) MAIS as de outline (set_logline/set_theme, add_beat/edit_beat) e ferramentas de LEITURA (ver outline, cenas, personagens já existentes) pra dar contexto ao modelo. Conversa em streaming. Ações de 'explodir' beat em cenas e cena em shots guiadas pelo agente. Cada mutação auto-commita (o histórico é a revisão). Metering de custo por turno + respeito ao teto. Cancelamento via AbortSignal.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Agente de co-criação responde em streaming usando o thread persistido
- [ ] #2 Ferramentas de leitura e de escrita (outline, personagens, cenas, shots) compartilhadas com o parse onde fizer sentido
- [ ] #3 Explodir beat->cenas e cena->shots funciona via ferramentas do agente
- [ ] #4 Custo por turno é registrado, respeita o teto, e o turno é cancelável
<!-- AC:END -->
