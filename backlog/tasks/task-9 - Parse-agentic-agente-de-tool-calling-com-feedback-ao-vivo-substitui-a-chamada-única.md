---
id: TASK-9
title: >-
  Parse agentic: agente de tool-calling com feedback ao vivo (substitui a
  chamada única)
status: Done
assignee:
  - '@claude'
created_date: '2026-06-26 00:18'
updated_date: '2026-06-26 00:31'
labels:
  - backend
  - frontend
  - parse
dependencies: []
priority: high
ordinal: 9000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
O parse hoje é uma chamada única ao LLM pedindo um JSON inteiro — frágil (JSON inválido/timeout/contexto derrubam tudo) e sem feedback (filme trava em 15%). Trocar por um AGENTE de tool-calling: o modelo constrói a estrutura incrementalmente via tools (set_metadata, add_character, add_scene, add_shot, finish), num loop multi-turno. Cada tool emite um passo visível (log ao vivo), o custo é somado por rodada (respeita teto), e o cancelamento (TASK-8) aborta o fetch da rodada e o loop checa o signal. Guard-rails: máximo de rodadas, validação por tool e no fim. Começa pelo filme; HQ pode seguir o mesmo padrão. Refs: backend/src/services/ai.ts, backend/src/services/script.ts, frontend/src/pages/Overview.tsx, backend/src/lib/validate.ts.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 O parse de filme roda como loop de tool-calling (set_metadata/add_character/add_scene/add_shot/finish), montando ParsedScript incrementalmente
- [x] #2 Cada passo do agente vira mensagem de progresso ao vivo; a tela mostra um log dos passos durante o parse
- [x] #3 Custo somado por rodada (respeita teto); cancelar aborta o fetch e o loop; guard-rail de máximo de rodadas
- [x] #4 Resultado validado (validateParsedScript) antes de salvar; erros claros
- [x] #5 typecheck e build passam
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implementado e validado contra o gateway real (gemini-2.5-pro). services/parseAgent.ts: loop de tool-calling (set_metadata/add_character/add_scene/add_shot/finish) montando ParsedScript incrementalmente; emite um passo por tool via onStep (=handle.update). ai.ts ganhou chatWithTools (rodada OpenAI tools, captura custo). script.ts: startScriptParse usa parseScriptAgentic com handle.signal+handle.update. Guard-rails: MAX_ROUNDS=120, MAX_SCENES/SHOTS, validação por tool (args ruins viram erro p/ o modelo corrigir) e validateParsedScript no fim. recordSpend+assertUnderCap por rodada; cancelar (TASK-8) aborta a rodada e o loop checa signal. Frontend Overview (filme): acumula os passos num log ao vivo rolável durante o parse. Teste: roteiro de 2 cenas → 13 passos, 2 cenas/2 personagens/5 shots, válido. HQ continua no parser streaming antigo (pode migrar depois). Typecheck e build OK.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Parse de filme virou um agente de tool-calling: o modelo constrói a estrutura via tools (metadata/personagem/cena/shot/finish) num loop, com log de passos ao vivo na tela, custo por rodada (respeita teto), cancelamento real e guard-rails. Bem mais robusto que a chamada única e com o feedback em tempo real pedido. Validado contra o gateway real.
<!-- SECTION:FINAL_SUMMARY:END -->
