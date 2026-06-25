---
id: TASK-4
title: >-
  Gerar imagem via gateway LiteLLM com lista de modelos configurável (codex vira
  opção manual)
status: In Progress
assignee:
  - '@claude'
created_date: '2026-06-25 15:06'
updated_date: '2026-06-25 15:14'
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
- [ ] #4 Codex permanece disponível apenas como opção manual explícita, fora do modo API automático
- [ ] #5 Erros do gateway/provedor são exibidos de forma clara; typecheck e build passam
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Backend: novo services/imagegen.ts (gateway LiteLLM — /images/edits com refs do quadro, senão /images/generations; captura custo do header x-litellm-response-cost; b64_json ou url). startRenderGeneration agora usa o gateway por padrão com o modelo escolhido (opts.model ou o primeiro de imageModels), faz assertUnderCap + recordSpend e grava generationModel no Render; codex só roda com opts.useCodex (manual/offline). Rota renders/generate aceita {model, useCodex}. settings ganhou imageModels (lista normalizada). Frontend: AppSettingsDTO.imageModels + Render.generationModel; SettingsPanel gerencia a lista (StringList, salva auto); StudioItem.apiGenerate aceita {model}; Estúdio tem seletor de modelo de imagem (default = primeiro) e passa o modelo escolhido no loop API; mostra o modelo no painel. QuadroCard/Pranchas passam a gerar pelo gateway também. Typecheck e build OK. PENDENTE p/ AC#4: o codex é alcançável via useCodex (fora do modo API), mas o botão de UI 'gerar via codex (local)' será adicionado junto da UI unificada (TASK-6).
<!-- SECTION:NOTES:END -->
