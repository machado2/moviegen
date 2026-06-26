---
id: TASK-11
title: Migrar o parse da HQ para o agente de tool-calling (Vercel AI SDK)
status: Done
assignee:
  - '@claude'
created_date: '2026-06-26 01:34'
updated_date: '2026-06-26 01:52'
labels: []
dependencies: []
priority: high
ordinal: 15000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
O parse de roteiro da HQ (comics/services/ai.ts parseComicsScript) ainda é uma chamada única com streaming que só dá feedback de KB recebidos. Migrar para o mesmo padrão agentic do filme (TASK-10.1): um agente de tool-calling sobre o Vercel AI SDK que constrói a ParsedComicsScript incrementalmente (set_metadata, add_character, add_prancha, add_quadro, finish), com feedback ao vivo por passo, custo metrado pelo gateway compartilhado e teto, e cancelamento. Dar à Overview da HQ o mesmo log de passos ao vivo que o filme tem. Aposentar o parseComicsScript one-shot e o chat() SSE da HQ se ficarem órfãos.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Parse da HQ roda por um agente de tool-calling do Vercel AI SDK construindo title/personagens/pranchas/quadros incrementalmente
- [x] #2 Feedback ao vivo por passo (personagem/prancha/quadro) na Overview da HQ, com botão de abortar já existente
- [x] #3 Custo metrado via gateway compartilhado e teto respeitado; cancelamento funciona
- [x] #4 ParsedComicsScript validada antes de salvar; layouts/slotFormats coerentes com os tipos
- [x] #5 Backend e frontend typecheck/build; smoke-test real contra o gateway
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Criado comics/services/parseAgent.ts (parseComicsScriptAgentic) espelhando o do filme: generateText + tools set_metadata/add_character/add_prancha/add_quadro/finish, stopWhen=[hasToolCall('finish'),stepCountIs(160)], gateway compartilhado (custo via header + teto mid-loop), AbortSignal. Layouts e slotFormats e tipos de texto como z.enum, coerentes com validate.ts. Repontado comics/services/script.ts startScriptParse para o agente com handle.update como onStep. Removidos os órfãos do comics/services/ai.ts (parseComicsScript one-shot, chat SSE, extractJson, PARSE_SYSTEM_PROMPT) — restou só generateFrame (codex). Overview da HQ ganhou o log de passos ao vivo (parseLog) igual ao filme; texto do diálogo de confirmação atualizado (agente em passos, não chamada única) nas DUAS Overviews. Smoke-test real (gemini-2.5-flash): 'O Último Bonde', 2 personagens, 2 pranchas, 4 quadros, 12 passos, texto verbatim preservado, validação OK, custo US$0.00164, 6.8s. backend+frontend typecheck/build OK.

Refino pós-entrega: slotFormat do quadro deixou de ser pedido ao modelo e passou a ser DERIVADO de slotFormatFor(layout, posição) no builder — garante coerência layout↔slotFormat na hora (era o que o apply já re-derivava). Removida a constante SLOT_FORMATS órfã e o campo do schema da tool add_quadro; system prompt ajustado (modelo só escolhe o layout). Re-smoke: P1/P2 rows-2 agora com 'horizontal alto, proporção 4:3' coerente; filme sem regressão. (502s observados durante o teste eram instabilidade transitória do gateway, confirmado com chamada trivial OK.)
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Parse da HQ migrado para o mesmo agente de tool-calling do filme (Vercel AI SDK): monta title/personagens/pranchas/quadros incrementalmente com feedback ao vivo, custo metrado, teto e cancelamento; layouts/slotFormats coerentes com os tipos. Órfãos removidos; Overview da HQ com log de passos. Validado com smoke-test real.
<!-- SECTION:FINAL_SUMMARY:END -->
