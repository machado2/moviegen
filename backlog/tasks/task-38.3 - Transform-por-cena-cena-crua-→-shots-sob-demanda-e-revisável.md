---
id: TASK-38.3
title: 'Transform por cena (cena crua → shots), sob demanda e revisável'
status: Done
assignee: []
created_date: '2026-06-27 23:48'
updated_date: '2026-06-28 13:39'
labels:
  - pipeline
  - backend
  - film
dependencies:
  - TASK-38.1
parent_task_id: TASK-38
priority: medium
ordinal: 50000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
A transformação criativa (a parte cara, onde ainda não pegamos o jeito) deixa de ser feita pro filme todo de uma vez e passa a ser POR CENA, sob demanda. Pega a cena crua e gera os shots (camera/action/exit/diegeticTexts/sounds/lines/refs), com contexto do elenco/lugares e das cenas vizinhas (continuityIn/out já existem) para manter continuidade.

Deve: ser disparável por cena (gatilho no Pipeline/Cenas/Estúdio — decisão em aberto na mãe); ser re-rodável barato (a cena crua fica intacta); idealmente produzir CANDIDATOS de breakdown (vários jeitos de quebrar a cena), como já fazemos com mídia; permitir modelo próprio (caro só onde precisa).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Transformar uma cena gera seus shots sem reprocessar o roteiro inteiro
- [x] #2 Re-transformar uma cena não destrói a cena crua nem (idealmente) as tomadas já feitas dos shots preservados
- [x] #3 A transformação recebe contexto (elenco/lugares + cenas vizinhas) para continuidade
- [x] #4 Suporta candidatos de breakdown da cena (vários resultados a escolher)
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Serviço transformScene(projectId, sceneNumber, {model?}): lê a cena crua (scenes-raw/<n>.ncl) + elenco/lugares do projeto + cabeçalhos/resumos das cenas vizinhas (n-1,n+1) para continuidade; roda um agente/prompt focado 'cena→shots' (reaproveita blocos do parseAgent) produzindo um ParsedScene de UMA cena.
2. Aplica mesclando na Scene derivada reaproveitando a lógica de merge por 'order' do applyParsedScript (extrair helper mergeSceneShots) — preserva ids de shot e takes; cria a Scene se não existir.
3. Candidatos de breakdown: persistir scene-breakdowns/<n>/<id>.ncl (vários resultados); selecionar aplica à Scene de produção (reusa filosofia de variantes). 
4. Roda como job (LLM) com ref por cena; endpoints POST /projects/:id/scenes/:number/transform, GET candidatos, POST selecionar.
5. Frontend: ação 'Transformar cena' em Cenas (lista cenas cruas + botão + candidatos). Mínimo viável primeiro.
6. Não toca a cena crua; re-rodar é barato. Aditivo: o parse one-shot atual continua funcionando.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Backend (commit c5066d8): transformAgent + SceneBreakdown + startSceneTransform/list/select + applyParsedScene (merge preserva takes) + endpoints. Frontend: client (rawScenes/extract/transformScene/breakdowns/selectBreakdown) + RawScenesPanel (extrair cenas cruas → Transformar por cena via job/SSE → escolher breakdown 'Usar') no topo da página Cenas. Smoke backend 8/8; builds verdes. Aditivo: parse one-shot intacto.
<!-- SECTION:NOTES:END -->
