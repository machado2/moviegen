---
id: TASK-38.3
title: 'Transform por cena (cena crua → shots), sob demanda e revisável'
status: To Do
assignee: []
created_date: '2026-06-27 23:48'
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
- [ ] #1 Transformar uma cena gera seus shots sem reprocessar o roteiro inteiro
- [ ] #2 Re-transformar uma cena não destrói a cena crua nem (idealmente) as tomadas já feitas dos shots preservados
- [ ] #3 A transformação recebe contexto (elenco/lugares + cenas vizinhas) para continuidade
- [ ] #4 Suporta candidatos de breakdown da cena (vários resultados a escolher)
<!-- AC:END -->
