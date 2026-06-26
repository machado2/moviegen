---
id: TASK-10.4
title: UI de chat de co-criação (frontend) com painel de estrutura ao vivo
status: To Do
assignee: []
created_date: '2026-06-26 00:43'
labels: []
dependencies:
  - TASK-10.2
  - TASK-10.3
parent_task_id: TASK-10
priority: high
ordinal: 14000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Tela/painel de co-criação no frontend usando o hook useChat do Vercel AI SDK (@ai-sdk/react): chat em streaming, botão de cancelar, e um painel lateral mostrando o outline/beats/cenas/shots evoluindo em tempo real conforme o agente chama as ferramentas. Ponto de entrada a partir da Overview do projeto, coexistindo com o botão de parse de roteiro pronto. Reaproveitar componentes de UI existentes (Dialog, Card, etc.).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Chat de co-criação em streaming com botão de cancelar
- [ ] #2 Painel mostra outline/beats/cenas/shots atualizando ao vivo conforme o agente age
- [ ] #3 Ponto de entrada na Overview, convivendo com o parse de roteiro pronto
<!-- AC:END -->
