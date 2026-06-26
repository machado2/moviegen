---
id: TASK-14.5
title: >-
  Frontend: Estúdio gera imagem (referências) e vídeo (shots) com combo de
  modelo
status: Done
assignee: []
created_date: '2026-06-26 07:39'
updated_date: '2026-06-26 08:00'
labels:
  - frontend
dependencies:
  - TASK-14.2
  - TASK-14.3
parent_task_id: TASK-14
ordinal: 23000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
useStudioQueue: wire apiGenerate para referências de imagem (filme char/location + HQ personagens) e para shots de vídeo de filme (chamando as novas rotas + followJob). Estúdio: para itens accepts:'video' mostrar combo de videoModels + botão Gerar (espelhando o de imagem); manter upload como alternativa. Clients (client.ts/comicsClient.ts) ganham os métodos de generate.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Referências de imagem (filme/HQ) mostram botão Gerar com API e seletor de imageModels
- [x] #2 Shots de filme mostram seletor de videoModels + botão Gerar; upload continua disponível
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
useStudioQueue: apiGenerate+followJob nas referências de filme (image), shots de filme (video via generateVideo) e personagens de HQ (image); prompts passados do cliente (WYSIWYG). Estudio: seletor de modelo conforme accepts (image/video) + botão Gerar; runApi escolhe modelo por modalidade. Clients ganharam generateImage/generateVideo. FilmApp/ComicsApp/GenerateModal repassam videoModels. Build+tsc OK.
<!-- SECTION:NOTES:END -->
