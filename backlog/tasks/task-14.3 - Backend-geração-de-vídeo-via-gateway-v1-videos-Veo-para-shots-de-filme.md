---
id: TASK-14.3
title: 'Backend: geração de vídeo via gateway /v1/videos (Veo) para shots de filme'
status: Done
assignee:
  - '@claude'
created_date: '2026-06-26 07:39'
updated_date: '2026-06-26 08:00'
labels:
  - backend
dependencies:
  - TASK-14.1
parent_task_id: TASK-14
ordinal: 21000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Novo serviço videogen.ts: POST /v1/videos {model: gemini/veo-3.x-generate-preview, prompt, seconds?, size?, input_reference?} -> {id,status}; poll GET /v1/videos/{id} até completed/failed; GET /v1/videos/{id}/content -> mp4. Rota de geração para shot de filme que roda como job (cria, faz polling, baixa, salva como take 'generated', seleciona) e registra custo (header x-litellm-response-cost best-effort + estimativa). Tratar timeout (~10min) e erro de operação.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Serviço cria, faz polling e baixa o vídeo do gateway; lida com status failed e timeout
- [x] #2 Rota de geração de shot retorna jobId; o mp4 vira um take generated selecionado; custo registrado quando informado
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
services/videogen.ts: create POST /videos -> poll GET /videos/{id} (8s, timeout 10min, honra AbortSignal) -> download /videos/{id}/content; custo via x-litellm-response-cost best-effort. services/shotgen.ts: job kind video-generate, salva mp4 como take generated e seleciona; usa videoModels[0] por padrão. Rota POST /projects/:id/scenes/:sceneId/shots/:shotId/generate-video. Typecheck OK. Smoke-test runtime pendente (ao final).

Smoke-test runtime OK: gemini/veo-3.0-fast-generate-001 gerou MP4 (957KB) em ~35s via create->poll->content. Ids reais confirmados via ListModels (veo-2.0-generate-001, veo-3.0-generate-001, veo-3.0-fast-generate-001, veo-3.1-generate-preview, veo-3.1-fast-generate-preview, veo-3.1-lite-generate-preview). Custo vem null (sem header) -> mostrado como —.
<!-- SECTION:NOTES:END -->
