---
id: TASK-10.4
title: UI de chat de co-criação (frontend) com painel de estrutura ao vivo
status: Done
assignee:
  - '@claude'
created_date: '2026-06-26 00:43'
updated_date: '2026-06-26 01:26'
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
- [x] #1 Chat de co-criação em streaming com botão de cancelar
- [x] #2 Painel mostra outline/beats/cenas/shots atualizando ao vivo conforme o agente age
- [x] #3 Ponto de entrada na Overview, convivendo com o parse de roteiro pronto
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
CoCreate.tsx: chat em streaming via useChat (@ai-sdk/react) + DefaultChatTransport apontando para /projects/:id/cocreate/chat. Layout 2 colunas: ChatPane (esquerda) e StructurePanel (direita, outline/temas/atos→beats + personagens + cenas). Botão 'Parar' (stop()) durante streaming, 'Limpar' conversa (DELETE thread + remount). Seed das mensagens iniciais a partir do thread persistido (GET) na montagem; outline recarregado a cada turno (onFinish) e em POLLING de 1.5s enquanto streaming (cada tool já commitou em disco, então a estrutura aparece ao vivo). onChanged() recarrega o projeto (cenas/personagens). Client: grupo cocreate (outline/chatThread/clearChat/chatUrl). Nova aba 'Co-criar' no FilmApp, coexistindo com 'Projeto' (parse). Corrigido bug: escutar reply.raw 'close' (não req.raw, que dispara ao consumir o corpo e abortava todo turno) com guarda writableFinished. Validado E2E contra o servidor de produção (node dist/server.js): stream 12 deltas/0 abortos, outline+ato+personagem persistidos, thread 2 msgs + 3 toolEvents, custo US$0.0013. frontend typecheck + vite build OK; parse re-smoke sem regressão.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
UI de co-criação: chat em streaming (useChat) com botão de parar e limpar, ao lado de um painel de estrutura (outline→beats, personagens, cenas) que atualiza ao vivo por polling enquanto o agente age. Aba dedicada no FilmApp coexistindo com o parse. Validado E2E contra o servidor de produção.
<!-- SECTION:FINAL_SUMMARY:END -->
