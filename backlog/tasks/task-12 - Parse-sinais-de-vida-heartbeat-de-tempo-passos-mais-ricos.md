---
id: TASK-12
title: 'Parse: sinais de vida (heartbeat de tempo + passos mais ricos)'
status: Done
assignee:
  - '@claude'
created_date: '2026-06-26 02:11'
updated_date: '2026-06-26 02:14'
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
- [x] #1 Durante o parse, a linha de status mostra tempo decorrido + contagens atualizando a cada ~2s (prova de que não travou)
- [x] #2 Mensagens de passo mais descritivas (personagem/cena/shot ou prancha/quadro com trecho)
- [x] #3 Heartbeat não polui o log de passos; custo exato preservado
- [x] #4 Vale para filme e HQ; backend+frontend typecheck/build; smoke-test real
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Heartbeat por tempo (setInterval 2s) em parseScriptAgentic (filme) e parseComicsScriptAgentic (HQ): emite '⏳ Trabalhando há Ns · X cenas/pranchas · Y shots/quadros…' enquanto a primeira chamada do modelo roda (antes de qualquer tool). clearInterval no finally. Passos enriquecidos: shot com trecho de câmera/ação; quadro com trecho de composição/cenário. Frontend (ambas Overviews) filtra mensagens '⏳' do log de passos — ficam só na linha de status ao vivo. Mantido generateText (custo exato pelo header, sem trocar pra streaming). Smoke real (filme): heartbeats '⏳ 2s/4s … o modelo está lendo o roteiro…' aparecem antes dos passos, depois shots com snippet. typecheck+build OK.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Parse agora mostra sinal de vida: heartbeat com tempo decorrido + contagens a cada 2s durante a (longa) primeira chamada do modelo, e passos mais descritivos. Filme e HQ. Heartbeat só na linha de status, não no log; custo exato preservado.
<!-- SECTION:FINAL_SUMMARY:END -->
