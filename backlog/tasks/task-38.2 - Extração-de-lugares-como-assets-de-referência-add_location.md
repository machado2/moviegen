---
id: TASK-38.2
title: Extração de lugares como assets de referência (add_location)
status: To Do
assignee: []
created_date: '2026-06-27 23:48'
labels:
  - pipeline
  - backend
  - film
  - comics
dependencies: []
parent_task_id: TASK-38
priority: medium
ordinal: 49000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Hoje lugares NÃO são extraídos: o parse só tem add_character; cenário vive solto em Scene.summary/Shot.action (filme) e Quadro.setting (HQ), sem virar asset reaproveitável. Adicionar extração de lugares com descrição, virando assets de referência geráveis (role 'location' já existe nos tipos do filme; criar o equivalente na HQ). Vale filme e HQ.

Inclui: ferramenta add_location no(s) parse agent(s) ou na etapa de extração; criação de assets de lugar (pending) a partir da descrição; prompts de geração de imagem de lugar (packages/core/src/prompts).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Parse/extração identifica lugares recorrentes com descrição
- [ ] #2 Lugares viram assets de referência geráveis (filme e HQ)
- [ ] #3 Prompt de geração de imagem de lugar existe e usa a descrição extraída
<!-- AC:END -->
