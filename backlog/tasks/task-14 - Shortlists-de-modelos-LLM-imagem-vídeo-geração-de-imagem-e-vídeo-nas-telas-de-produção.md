---
id: TASK-14
title: >-
  Shortlists de modelos (LLM/imagem/vídeo) + geração de imagem e vídeo nas telas
  de produção
status: Done
assignee: []
created_date: '2026-06-26 07:38'
updated_date: '2026-06-26 08:00'
labels: []
dependencies: []
ordinal: 18000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Hoje só há um campo único de modelo de parse/TTS e a shortlist de imagem; a busca no catálogo do OpenRouter traz coisa demais. Falta: shortlist curada de LLM e de vídeo; e nas telas de produção falta combo de modelo + botão Gerar (referências de imagem só aceitam upload; shots de vídeo não têm geração nenhuma). Objetivo: Configurações vira listas curadas por categoria (LLM/imagem/vídeo) com seletor por uso, e o Estúdio passa a gerar imagem (referências de filme/HQ) e vídeo (shots de filme via Veo no gateway /v1/videos). Decisões do usuário: tentar geração de vídeo agora; listas curadas + seletor por uso.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Configurações tem três shortlists curadas (LLM/imagem/vídeo); a busca no catálogo só aparece ao gerenciar a lista
- [x] #2 Onde se escolhe modelo (parse, co-criação, imagem, vídeo) é um seletor com os itens da shortlist da categoria
- [x] #3 Referências de imagem (personagens/cenários de filme e personagens de HQ) têm botão Gerar via API, além do upload
- [x] #4 Shots de filme podem ser gerados como vídeo via gateway (/v1/videos, Veo) com combo de modelo + botão Gerar
- [x] #5 Custo das gerações de imagem/vídeo é contabilizado no gasto do projeto quando o gateway informa
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implementado em 14.1–14.5. Vídeo via Veo no gateway validado em runtime. Custo de vídeo vem null (gateway não envia header nessas respostas) -> exibido como —.
<!-- SECTION:NOTES:END -->
