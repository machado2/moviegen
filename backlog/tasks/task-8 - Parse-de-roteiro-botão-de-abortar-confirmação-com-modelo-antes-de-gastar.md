---
id: TASK-8
title: 'Parse de roteiro: botão de abortar + confirmação (com modelo) antes de gastar'
status: Done
assignee:
  - '@claude'
created_date: '2026-06-25 17:59'
updated_date: '2026-06-25 18:15'
labels:
  - backend
  - frontend
  - ux
dependencies: []
priority: high
ordinal: 8000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Hoje 'Parsear com IA' dispara uma chamada de LLM (custa) sem confirmação e sem como cancelar — o usuário foi pego de surpresa gastando. Adicionar: (1) confirmação antes do parse mostrando o modelo de parse atual; (2) botão de abortar durante o parse, com cancelamento real (AbortController no job-queue propagado até o fetch do chat). Vale filme e HQ. Refs: backend/src/jobs/queue.ts, backend/src/services/ai.ts, backend/src/comics/services/ai.ts, backend/src/services/script.ts, backend/src/comics/services/script.ts, frontend/src/pages/Overview.tsx, frontend/src/pages/comics/Overview.tsx.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Job-queue suporta cancel(id) que aborta o fetch em andamento (AbortController propagado até chat); estado vira 'Cancelado'
- [x] #2 Endpoint de cancelar o parse ativo (filme e HQ); client expõe cancelParse
- [x] #3 A tela mostra um botão Abortar durante o parse que cancela de fato
- [x] #4 Antes de parsear, há uma confirmação mostrando o modelo de parse; nada roda sem o usuário confirmar
- [x] #5 typecheck e build passam
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Backend: jobQueue ganhou AbortController por job (handle.signal) e cancel(id) que aborta o fetch em voo e marca 'Cancelado' (com guarda pra catch/done não sobrescreverem). chat() do filme e da HQ combinam o timeout com o signal externo via AbortSignal.any; parseScript/parseComicsScript recebem e propagam o signal. cancelScriptParse(projectId) acha o job ativo por ref e cancela. Rotas POST /projects/:id/script/parse/cancel (filme + HQ). Frontend: client.script.cancelParse (filme + HQ); Overview (filme + HQ) tem confirmação antes de parsear mostrando o parseModel, e botão Abortar durante o parse. Typecheck e build OK.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Parse agora pede confirmação antes de rodar (mostrando o modelo) e tem botão Abortar que cancela de verdade — AbortController no job-queue propagado até o fetch do LLM, estado vira 'Cancelado'. Vale filme e HQ.
<!-- SECTION:FINAL_SUMMARY:END -->
