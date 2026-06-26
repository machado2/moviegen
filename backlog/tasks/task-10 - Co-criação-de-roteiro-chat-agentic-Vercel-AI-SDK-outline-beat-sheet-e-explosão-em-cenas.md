---
id: TASK-10
title: >-
  Co-criação de roteiro: chat agentic (Vercel AI SDK), outline/beat sheet e
  explosão em cenas
status: To Do
assignee: []
created_date: '2026-06-26 00:42'
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
- [ ] #1 Existe um modo de co-criação por chat, separado e coexistindo com o parse de roteiro pronto
- [ ] #2 O agente usa o Vercel AI SDK (não o loop chatWithTools/parseAgent feito à mão)
- [ ] #3 Existe um artefato de outline/beat sheet (logline, tema, atos -> beats) que o chat preenche antes das cenas
- [ ] #4 O agente compartilha as ferramentas de mutação do projeto entre parse e co-criação
<!-- AC:END -->
