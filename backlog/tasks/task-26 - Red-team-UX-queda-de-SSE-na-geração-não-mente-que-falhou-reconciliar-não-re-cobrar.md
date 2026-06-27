---
id: TASK-26
title: >-
  Red-team UX: queda de SSE na geração não mente que falhou (reconciliar, não
  re-cobrar)
status: Done
assignee: []
created_date: '2026-06-27 20:38'
updated_date: '2026-06-27 22:15'
labels:
  - redteam
  - frontend
  - money
dependencies: []
priority: high
ordinal: 35000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Queda de EventSource durante geração rejeita com 'Conexão de progresso perdida' e mostra 'Geração falhou', mas o job continua no servidor e fatura -> usuário re-gera e paga em dobro. Espelhar o tratamento honesto do parse: na queda de SSE, re-pollar o job e avisar que pode ainda estar rodando; reconciliar candidatos antes de permitir retry.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Na queda de SSE a UI não afirma falha; informa que a geração pode ainda estar rodando no servidor
- [ ] #2 Lista de candidatos é reconciliada (re-poll/refetch) antes de oferecer retry
<!-- AC:END -->
