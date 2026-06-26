---
id: TASK-12
title: 'Parse: sinais de vida (heartbeat de tempo + passos mais ricos)'
status: In Progress
assignee:
  - '@claude'
created_date: '2026-06-26 02:11'
updated_date: '2026-06-26 02:11'
labels: []
dependencies: []
priority: high
ordinal: 16000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Ao rodar o parse com IA, durante a primeira chamada (longa) do modelo nada é emitido — fica só 'Lendo o roteiro e montando a estrutura' e parece travado. Adicionar um heartbeat por tempo (a cada ~2s) mostrando tempo decorrido + contagem atual (cenas/shots ou pranchas/quadros), e enriquecer as mensagens de passo (incluir trechos: ex. shot com câmera/ação curta). Vale para filme e HQ. Manter o custo exato (header do gateway) — não trocar para streaming. O log de passos só acumula passos reais; o heartbeat fica só na linha de status ao vivo.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Durante o parse, a linha de status mostra tempo decorrido + contagens atualizando a cada ~2s (prova de que não travou)
- [ ] #2 Mensagens de passo mais descritivas (personagem/cena/shot ou prancha/quadro com trecho)
- [ ] #3 Heartbeat não polui o log de passos; custo exato preservado
- [ ] #4 Vale para filme e HQ; backend+frontend typecheck/build; smoke-test real
<!-- AC:END -->
