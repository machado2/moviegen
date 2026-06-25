---
id: TASK-1
title: Rastrear custo de geração por item via o gateway LiteLLM
status: To Do
assignee: []
created_date: '2026-06-25 13:53'
labels:
  - backend
  - frontend
  - custo
dependencies: []
references:
  - docs/ux-spec.md
  - backend/src/services/ai.ts
  - backend/src/comics/services/ai.ts
  - frontend/src/components/Estudio.tsx
priority: high
ordinal: 1000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
O gateway LiteLLM (OpenAI-compatible) retorna 'usage' (tokens) em cada completion e pode expor custo. A filosofia do 'freio de gasto' da spec (docs/ux-spec.md §13) pede o custo real sempre visível e um teto configurável com pausa automática. Hoje o Estúdio só mostra 'N gerados nesta sessão' + rate-limit, sem R$/$ real.

Resultado: capturar usage/custo de cada chamada de LLM (parse e geração de prompt de imagem; e geração de imagem quando houver custo), acumular por projeto, expor via API e mostrar no Estúdio, mais um teto que pausa o modo API ao atingir o limite.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Backend captura 'usage' (e custo quando presente) das respostas do gateway e persiste um total acumulado por projeto
- [ ] #2 O Estúdio (cabeçalho e painel do modo API) mostra o custo acumulado da sessão e, quando conhecido, o custo por item
- [ ] #3 Um teto de gasto configurável pausa automaticamente a geração no modo API ao ser atingido
- [ ] #4 Custo nunca é inventado: mostra '—' quando o gateway não retornou custo
<!-- AC:END -->
