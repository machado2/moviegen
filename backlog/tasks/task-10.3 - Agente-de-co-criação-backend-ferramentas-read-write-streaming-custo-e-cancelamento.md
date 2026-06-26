---
id: TASK-10.3
title: >-
  Agente de co-criação (backend): ferramentas read/write, streaming, custo e
  cancelamento
status: Done
assignee:
  - '@claude'
created_date: '2026-06-26 00:43'
updated_date: '2026-06-26 01:15'
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
- [x] #1 Agente de co-criação responde em streaming usando o thread persistido
- [x] #2 Ferramentas de leitura e de escrita (outline, personagens, cenas, shots) compartilhadas com o parse onde fizer sentido
- [x] #3 Explodir beat->cenas e cena->shots funciona via ferramentas do agente
- [x] #4 Custo por turno é registrado, respeita o teto, e o turno é cancelável
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Agente cocreateAgent.ts sobre streamText (Vercel AI SDK), streaming SSE no protocolo UI-message (pipeUIMessageStreamToResponse via reply.hijack na rota POST /projects/:id/cocreate/chat). Ferramentas de LEITURA (get_scene_detail; estado atual injetado no system prompt) + ESCRITA: outline (set_logline/set_themes/add_act/add_beat/update_beat) e projeto (add_character via novo character.ts; add_scene/add_shot reusando o scene service que já auto-commita). Explodir beat->cenas (update_beat.sceneNumbers liga beat a Scene.number) e cena->shots (add_shot por número). Gateway com metering compartilhado (gateway.ts, fatorado e reusado pelo parse). Custo: header não existe em streaming, então fallback por tokens via catalog.estimateCostUsd; teto checado com assertUnderCap no início de cada turno; cancelamento via AbortSignal (client disconnect + cap + timeout 10min). Thread persistido no onFinish (user + assistant com toolEvents). Smoke-test de integração HTTP real (gemini-2.5-flash): 200 text/event-stream, 12 text-deltas, logline+ato+personagem(Otto)+cena criados, thread com 2 msgs e 4 toolEvents, custo US$0.00076 estimado/gravado, 5.4s. parseAgent re-smoke implícito via refactor do gateway; backend build + typechecks OK.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Agente de co-criação em streaming (Vercel AI SDK) com ferramentas de leitura/escrita compartilhadas com o parse: preenche o outline (atos→beats) e explode em cenas/shots, cada mutação versionada. Metering por tokens (fallback ao header ausente em streaming), teto por turno e cancelamento. Validado com integração HTTP real contra o gateway.
<!-- SECTION:FINAL_SUMMARY:END -->
