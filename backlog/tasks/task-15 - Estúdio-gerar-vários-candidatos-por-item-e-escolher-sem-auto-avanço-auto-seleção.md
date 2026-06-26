---
id: TASK-15
title: >-
  Estúdio: gerar vários candidatos por item e escolher (sem
  auto-avanço/auto-seleção)
status: Done
assignee: []
created_date: '2026-06-26 11:52'
updated_date: '2026-06-26 12:15'
labels: []
dependencies: []
ordinal: 24000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Hoje 'Gerar com API' roda um loop em lote que avança e seleciona sozinho. O usuário quer, por item: gerar sob demanda (sem pular pro próximo), manter TODOS os resultados gerados como candidatos, e escolher qual usar como ação separada. Vale para shots (takes), quadros (renders) e imagens de referência (que hoje sobrescrevem arquivo único e precisam ganhar variantes).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Botão de gerar produz apenas o item atual e NÃO avança para o próximo
- [x] #2 Geração via API nunca auto-seleciona o resultado (nem o primeiro); upload manual continua selecionando
- [x] #3 Cada geração acumula um candidato; nada gerado é descartado/sobrescrito
- [x] #4 Asset de referência ganha modelo de variantes (array + seleção) no backend, rotas e export/import
- [x] #5 Estúdio mostra galeria de candidatos do item atual com 'Usar esta' e excluir, por item
- [x] #6 Avanço para o próximo item permanece manual
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Backend: Asset/ComicsAsset ganharam variants[]+selectedVariantId; asset.file espelha o selecionado (back-compat). addAssetVariant/select/delete/list/getVariantPath + rotas (GET/PUT selected-variant/DELETE/GET variants). Migração de asset legado (file único) sintetiza variante com id estável 'var_legacy'. Geração (assetgen, shotgen, comics assembly/render) acumula candidato com autoSelect:false (nunca seleciona); upload mantém auto-seleção. take.ts/render.ts ganharam flag autoSelect. Frontend: StudioCandidate + métodos listCandidates/selectCandidate/deleteCandidate/selectedCandidateId no StudioItem (takes/renders/variants). Estúdio reescrito: geração por item (sem auto-avanço), galeria de candidatos com 'Usar esta'/excluir, visualizador tela cheia (img+vídeo, Esc), updates otimistas (<100ms) para seleção/exclusão/troca de item/pular/reordenar + spinners em gerar/upload (requisito AGENTS.md). Smoke test validou upload/list/select/delete/serve e migração legada (filme+HQ).
<!-- SECTION:NOTES:END -->
