---
id: TASK-14.4
title: 'Frontend: Configurações com 3 shortlists curadas + seletor por uso'
status: Done
assignee:
  - '@claude'
created_date: '2026-06-26 07:39'
updated_date: '2026-06-26 08:00'
labels:
  - frontend
dependencies:
  - TASK-14.1
parent_task_id: TASK-14
ordinal: 22000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
SettingsPanel passa a ter três seções de shortlist curada (LLM/imagem/vídeo), cada uma: chips removíveis (primeiro=padrão) + ModelCombobox de busca no catálogo (purpose por categoria) para adicionar. Vídeo não está no catálogo do OpenRouter: oferecer sugestões conhecidas (ex.: gemini/veo-3.0-generate-preview) + free-text. Parse e TTS deixam de ser combobox de texto livre e viram seletor (dropdown) dos itens da shortlist de LLM/áudio; a busca grande só aparece ao gerenciar a lista.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Três shortlists gerenciáveis (LLM/imagem/vídeo) com chips + busca; vídeo aceita sugestões + free-text
- [x] #2 Parse/co-criação selecionam de dropdown da shortlist; catálogo grande só ao gerenciar a lista
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
SettingsPanel: subcomponente ModelShortlist reutilizado 3x (LLM/imagem/vídeo); parse/co-criação viram <select> da shortlist de LLM; TTS combobox de áudio. ModelCombobox ganhou purpose 'video' + knownIds (sugestões Veo, fora do catálogo). SettingsPatch +llmModels/+videoModels. Build OK.
<!-- SECTION:NOTES:END -->
