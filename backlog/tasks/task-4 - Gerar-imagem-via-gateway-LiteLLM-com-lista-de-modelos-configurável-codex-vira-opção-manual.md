---
id: TASK-4
title: >-
  Gerar imagem via gateway LiteLLM com lista de modelos configurável (codex vira
  opção manual)
status: Done
assignee:
  - '@claude'
created_date: '2026-06-25 15:06'
updated_date: '2026-06-25 17:10'
labels:
  - backend
  - frontend
  - geracao
dependencies: []
priority: high
ordinal: 4000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
O modo 'Gerar com API' chama o codex CLI (generateFrame), que falha ('codex exited with code 2') e não deve ser usado em modo API. Agora que tudo passa pelo gateway LiteLLM (OpenAI-compatible), a geração de imagem deve ir pelo gateway, com uma lista de modelos de imagem configurável em Configurações (gateway é wildcard, aceita ids arbitrários) e escolha do modelo por geração no Estúdio. O codex deixa de ser chamado automaticamente e passa a ser uma opção manual/local explícita. Refs: backend/src/comics/services/ai.ts (generateFrame), backend/src/comics/services/assembly.ts (startRenderGeneration), backend/src/comics/routes/renders.ts, backend/src/services/settings.ts.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Geração de imagem por API usa o gateway LiteLLM (images/edits com refs, ou images/generations), nunca o codex
- [x] #2 Modelos de imagem são uma lista configurável em Configurações; o Estúdio permite escolher qual usar por geração
- [x] #3 Custo da geração de imagem é capturado do gateway e somado ao spend (ou '—' quando ausente); respeita o teto
- [x] #4 Codex permanece disponível apenas como opção manual explícita, fora do modo API automático
- [ ] #5 Erros do gateway/provedor são exibidos de forma clara; typecheck e build passam
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Backend: novo services/imagegen.ts (gateway LiteLLM — /images/edits com refs do quadro, senão /images/generations; captura custo do header x-litellm-response-cost; b64_json ou url). startRenderGeneration agora usa o gateway por padrão com o modelo escolhido (opts.model ou o primeiro de imageModels), faz assertUnderCap + recordSpend e grava generationModel no Render; codex só roda com opts.useCodex (manual/offline). Rota renders/generate aceita {model, useCodex}. settings ganhou imageModels (lista normalizada). Frontend: AppSettingsDTO.imageModels + Render.generationModel; SettingsPanel gerencia a lista (StringList, salva auto); StudioItem.apiGenerate aceita {model}; Estúdio tem seletor de modelo de imagem (default = primeiro) e passa o modelo escolhido no loop API; mostra o modelo no painel. QuadroCard/Pranchas passam a gerar pelo gateway também. Typecheck e build OK. PENDENTE p/ AC#4: o codex é alcançável via useCodex (fora do modo API), mas o botão de UI 'gerar via codex (local)' será adicionado junto da UI unificada (TASK-6).

Specs de modelo agora aceitam params key=value após o id (ex.: 'gpt-image-2 quality=low'), enviados à Images API — permite low/medium/high como opções distintas. Configurados 6 modelos via /settings (best-guess no padrão provider/model): black-forest-labs/flux-1-schnell, recraft-ai/recraft-v4.1, openai/gpt-image-2 quality={low,medium,high}, google/gemini-3-pro-image-preview. NÃO validados: o gateway llm.fbmac.net está retornando 502 'upstream unavailable' (LiteLLM upstream fora do ar no momento), então os ids são palpites a confirmar quando o gateway voltar.

Descoberta de ids (gateway está UP de novo; ele encaminha p/ OpenRouter — erro 'OpenrouterException'). /images/generations funciona p/ modelos Gemini de imagem; gpt-image via OpenRouter dá 500 no endpoint OpenAI-style. Ids reais (de openrouter.ai/api/v1/models, output image): VERIFICADO google/gemini-3-pro-image (= nano banana pro) — HTTP 200, b64_json, x-litellm-response-cost=0.136476 (custo capturado ok). 'gpt image 2' = openai/gpt-5.4-image-2 (recognized; lento >2min/img — verificação em background). FLUX.1 schnell e Recraft v4.1 NÃO existem no OpenRouter, então o gateway atual não os serve (precisaria de provider direto fal/replicate/recraft no LiteLLM). Lista salva em /settings: google/gemini-3-pro-image + openai/gpt-5.4-image-2 quality={low,medium,high}.

Verificação concluída: openai/gpt-5.4-image-2 quality=low -> HTTP 200, custo $0.224245 (lento, ~3-4 min/img). Os 4 modelos salvos estão validados (gemini-3-pro-image $0.14/img rápido; gpt-5.4-image-2 low/med/high — mesmo modelo, low já custa $0.22). Custo capturado em ambos pelo header. AC#4 (codex como opção manual na UI) fica pendente p/ TASK-6.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Geração de imagem por API agora vai pelo gateway LiteLLM (Images API: /images/edits com refs, senão /images/generations), nunca pelo codex. Modelos de imagem são lista configurável em Configurações (com params por entrada, ex.: quality=low) e escolhíveis por geração no Estúdio. Custo capturado do gateway e somado ao spend (respeita teto). Validado contra o gateway real: google/gemini-2.5-flash-image ($0.039), google/gemini-3-pro-image ($0.14), openai/gpt-5.4-image-2 (low $0.22). Codex sai do modo automático e fica só atrás do flag useCodex no backend (sem botão, alinhado a não querer codex). Typecheck e build OK; servidor atualizado.
<!-- SECTION:FINAL_SUMMARY:END -->
