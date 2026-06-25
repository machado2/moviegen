---
id: TASK-7
title: >-
  Config global: seletor de modelo com busca/validação (catálogo do gateway) em
  vez de texto livre
status: Done
assignee:
  - '@claude'
created_date: '2026-06-25 17:52'
updated_date: '2026-06-25 18:50'
labels:
  - backend
  - frontend
  - ux
dependencies: []
priority: medium
ordinal: 7000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
A tela de Configurações globais (SettingsPanel) tem campos de texto livre para parseModel, ttsModel e imageModels — sem busca, sem validação, sem preço; o usuário precisa consultar os ids em outro lugar. O gateway é wildcard (não lista modelos), mas encaminha pro OpenRouter, cujo catálogo público (openrouter.ai/api/v1/models) tem id, nome, modalidades de entrada/saída e preço. Expor um endpoint de catálogo no backend (cacheado) e trocar os campos por um combobox com busca, filtrado por finalidade (texto p/ parse, imagem p/ imageModels, áudio p/ tts), mostrando preço e um indicador de validade. Manter entrada livre como fallback (wildcard pode aceitar ids fora do catálogo, e params tipo 'quality=low'). Refs: backend/src/services/settings.ts, frontend/src/components/SettingsPanel.tsx, frontend/src/lib/cost.ts.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Backend expõe GET /models/catalog (cacheado) com id, nome, modalidades e preço, derivado do catálogo do OpenRouter
- [x] #2 SettingsPanel usa um combobox com busca para parseModel, ttsModel e imageModels, filtrado por finalidade, mostrando preço/modalidade
- [x] #3 Slug digitado mostra indicador de validade (no catálogo ou não); entrada livre continua permitida como fallback
- [x] #4 Falha ao carregar o catálogo degrada para texto livre sem quebrar a tela; typecheck e build passam
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Backend: services/catalog.ts busca o catálogo do OpenRouter (config MODELS_CATALOG_URL) e cacheia 1h (serve stale em erro); GET /models/catalog devolve id/nome/modalidades/preço. Tipos: ModelCatalogEntry. Frontend: ModelCombobox (input com busca + dropdown filtrado por finalidade output text/image/audio, mostra modalidade in→out e preço $/Mtok, e indicador ✓ no catálogo / ⚠ fora — sempre permite texto livre). SettingsPanel: parseModel e ttsModel viraram combobox; imageModels virou chips removíveis (1º = padrão) + combobox de imagem + botão Adicionar. Catálogo carrega ao abrir o painel; se falhar, degrada pra texto livre. Validado: catálogo retorna 339 modelos, 9 de imagem filtrados certo, preço parseado. Typecheck e build OK.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Tela de Config agora tem busca/validação de modelos em vez de texto livre: um combobox alimentado pelo catálogo do OpenRouter (o que o gateway roteia), filtrado por finalidade (parse=texto, imagem, voz=áudio), com preço e indicador de validade; entrada livre + params continuam permitidos. imageModels com chips e adição via busca.
<!-- SECTION:FINAL_SUMMARY:END -->
