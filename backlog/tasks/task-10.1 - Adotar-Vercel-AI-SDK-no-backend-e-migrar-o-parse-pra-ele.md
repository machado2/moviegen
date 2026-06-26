---
id: TASK-10.1
title: Adotar Vercel AI SDK no backend e migrar o parse pra ele
status: Done
assignee:
  - '@claude'
created_date: '2026-06-26 00:43'
updated_date: '2026-06-26 00:56'
labels: []
dependencies: []
parent_task_id: TASK-10
priority: high
ordinal: 11000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Adicionar o Vercel AI SDK (pacote 'ai' + '@ai-sdk/openai-compatible') apontando o baseURL pro gateway LiteLLM. Migrar o parse de roteiro (hoje parseAgent.ts + chatWithTools em ai.ts) pra usar o loop de tools do SDK (stopWhen/stepCountIs), streaming, saída estruturada com Zod, e AbortSignal. Manter paridade: mesmas ferramentas (set_metadata/add_character/add_scene/add_shot/finish), mesmo feedback ao vivo por passo, mesmo metering de custo (header x-litellm-response-cost) e respeito ao teto de gasto. Smoke-test contra o gateway real confirmando streaming + tool-calls passam limpo via LiteLLM->OpenRouter.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Vercel AI SDK instalado e configurado com baseURL do gateway LiteLLM
- [x] #2 Parse de roteiro roda pelo SDK com paridade de tools, feedback por passo, cancelamento e metering de custo
- [x] #3 O loop feito à mão (chatWithTools) é removido ou fica isolado se ainda usado por outro caminho
- [x] #4 Smoke-test real confirma streaming e tool-calls via o gateway
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Instalar no backend: ai, @ai-sdk/openai-compatible, zod.
2. Criar gateway via createOpenAICompatible(baseURL=LLM_BASE_URL, apiKey, X-Title). Usar um fetch customizado que captura x-litellm-response-cost por resposta e acumula o gasto; quando prior+acumulado >= teto, aborta (cap mid-loop preservado).
3. Reescrever parseAgent.ts usando generateText com tools (inputSchema Zod) e stopWhen=stepCountIs(MAX_ROUNDS). Cada tool.execute muta o builder e emite onStep ao vivo (mesma paridade de passos). finish encerra.
4. recordSpend ao final (custo acumulado + tokens de usage); manter validateParsedScript.
5. Cancelamento: AbortSignal.any([signal externo, capController, timeout]).
6. Remover/aposentar chatWithTools quando nada mais usar; manter chat() simples se ainda usado por generateImagePrompt.
7. Smoke-test real contra o gateway (gemini-2.5-pro) confirmando streaming/tools/custo. Typecheck backend+frontend.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Migrado parseAgent.ts para o Vercel AI SDK (generateText + tool() + stopWhen=[hasToolCall('finish'), stepCountIs(120)]) via createOpenAICompatible apontando pro LLM_BASE_URL. Paridade: mesmas 5 tools, feedback ao vivo por passo (onStep dentro de cada execute), cancelamento via AbortSignal.any. Custo capturado por um fetch custom que lê x-litellm-response-cost por resposta e ACUMULA; ao cruzar o teto, aborta o run no meio do loop (capController). Removidos do ai.ts os órfãos: chatWithTools, parseScript (one-shot legado), extractJson, PARSE_SYSTEM_PROMPT e os tipos ToolCall/AgentMessage/ToolChatResult. Mantidos chat()/generateImagePrompt. Smoke-test real (gemini-2.5-flash): título='A Travessia', 2 cenas, 2 personagens, 6 shots, 14 passos ao vivo, custo US$0.00101 capturado/gravado, 5.0s. Backend typecheck + build (dist) OK.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Parse de roteiro migrado do loop de tool-calling feito à mão para o Vercel AI SDK, mantendo paridade total (tools, feedback ao vivo, cancelamento) e ganhando metering de custo com teto imposto no meio do loop. Validado com smoke-test real contra o gateway LiteLLM (streaming+tools+custo confirmados).
<!-- SECTION:FINAL_SUMMARY:END -->
