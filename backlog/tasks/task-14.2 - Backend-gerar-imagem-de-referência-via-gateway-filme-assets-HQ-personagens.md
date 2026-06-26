---
id: TASK-14.2
title: >-
  Backend: gerar imagem de referência via gateway (filme assets + HQ
  personagens)
status: Done
assignee:
  - '@claude'
created_date: '2026-06-26 07:39'
updated_date: '2026-06-26 07:46'
labels:
  - backend
dependencies:
  - TASK-14.1
parent_task_id: TASK-14
ordinal: 20000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Adicionar rota de geração de imagem por API para referências que hoje só aceitam upload: assets de filme (character-concept/face/body, location) e personagens de HQ. Reusa generateImageViaGateway, roda como job assíncrono com progresso, anexa referências existentes, salva o resultado como o arquivo do asset e registra o custo/spend.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 POST de geração para asset de filme e para personagem de HQ retorna jobId e roda assíncrono
- [x] #2 Usa o modelo passado (ou imageModels[0]); resultado vira o arquivo do asset; custo registrado quando informado
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Filme: services/assetgen.ts + rota POST /projects/:id/assets/:assetId/generate-image. HQ: startCharacterImageGeneration em comics/services/assembly.ts + rota /generate-image. Ambos rodam como job (kind image-generate), aceitam {model,prompt}, reusam generateImageViaGateway, salvam como arquivo do asset e registram spend. Backend typecheck OK.
<!-- SECTION:NOTES:END -->
