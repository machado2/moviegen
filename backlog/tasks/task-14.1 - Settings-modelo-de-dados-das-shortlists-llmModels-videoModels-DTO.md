---
id: TASK-14.1
title: 'Settings: modelo de dados das shortlists (llmModels/videoModels) + DTO'
status: Done
assignee:
  - '@claude'
created_date: '2026-06-26 07:39'
updated_date: '2026-06-26 07:42'
labels:
  - backend
dependencies: []
parent_task_id: TASK-14
ordinal: 19000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Adicionar shortlists curadas no settings.ncl/AppSettingsDTO: llmModels[] (texto: parse/co-criação) e videoModels[] (imageModels já existe). Normalização (trim/dedup/ordem; primeiro=padrão). getAiConfig expõe as listas. parseModel e o modelo de co-criação passam a resolver da shortlist de LLM quando não houver escolha explícita.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 AppSettingsDTO inclui llmModels e videoModels; updateSettings normaliza e persiste
- [x] #2 getAiConfig retorna llmModels/imageModels/videoModels; parse e co-criação usam a shortlist como fonte
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. AppSettingsDTO: +llmModels[] +videoModels[].
2. settings.ts: generalizar normalizeImageModels -> normalizeModelList; ler/gravar/normalizar os 3; getAiConfig expõe llmModels/imageModels/videoModels; parse/co-criação resolvem parseModel a partir da shortlist de LLM quando aplicável.
3. Build types+backend.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
AppSettingsDTO +llmModels/+videoModels; normalizeModelList generalizada; getAiConfig expõe as 3 listas e parseModel resolve da shortlist de LLM; rota PATCH /settings aceita os campos. Types+backend typecheck OK.
<!-- SECTION:NOTES:END -->
