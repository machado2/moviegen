---
id: TASK-10
title: >-
  Co-criação de roteiro: chat agentic (Vercel AI SDK), outline/beat sheet e
  explosão em cenas
status: Done
assignee: []
created_date: '2026-06-26 00:42'
updated_date: '2026-06-26 01:26'
labels: []
dependencies: []
priority: high
ordinal: 10000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Hoje só existe 'parsear um roteiro pronto' (parseAgent.ts, loop de tool-calling feito à mão). Adicionar um modo de CO-CRIAÇÃO: um chat onde o usuário discute a história com a IA, ela monta um outline/beat sheet, e juntos explodem beats em cenas e cenas em shots — um pedaço por vez, tudo versionado (auto-commit já existe). Decisões fechadas com o usuário: (1) adotar o Vercel AI SDK e aposentar o loop na mão; (2) parse e co-criação CONVIVEM, compartilhando as mesmas ferramentas de mutação do projeto; (3) introduzir um artefato de outline/beat sheet antes das cenas. Co-criação é um superconjunto do parse: mesmas tools, maestro diferente.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Existe um modo de co-criação por chat, separado e coexistindo com o parse de roteiro pronto
- [x] #2 O agente usa o Vercel AI SDK (não o loop chatWithTools/parseAgent feito à mão)
- [x] #3 Existe um artefato de outline/beat sheet (logline, tema, atos -> beats) que o chat preenche antes das cenas
- [x] #4 O agente compartilha as ferramentas de mutação do projeto entre parse e co-criação
<!-- AC:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Modo de co-criação de roteiro entregue em 4 subtarefas: (10.1) parse migrado pro Vercel AI SDK com gateway metrado; (10.2) modelo de dados outline/beat-sheet + thread em .ncl; (10.3) agente de co-criação em streaming com ferramentas read/write compartilhadas com o parse, metering por tokens e teto por turno; (10.4) UI de chat com painel de estrutura ao vivo. Convive com o parse de roteiro pronto. Validado E2E contra o servidor de produção.
<!-- SECTION:FINAL_SUMMARY:END -->
