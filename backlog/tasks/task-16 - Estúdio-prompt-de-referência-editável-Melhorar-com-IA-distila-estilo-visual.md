---
id: TASK-16
title: >-
  Estúdio: prompt de referência editável + 'Melhorar com IA' (distila estilo
  visual)
status: Done
assignee: []
created_date: '2026-06-26 13:15'
updated_date: '2026-06-26 13:15'
labels: []
dependencies: []
ordinal: 25000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
O prompt de referência despejava o globalStyle inteiro (narração, áudio, regras de história, influências) e tinha descrição física fraca, gerando referências inconsistentes; além de bug de ponto duplicado.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Prompt da referência é editável no Estúdio e enviado verbatim (WYSIWYG)
- [x] #2 Botão 'Melhorar com IA' reescreve via LLM: só pistas visuais, identidade física concreta, formato model sheet, no idioma do projeto
- [x] #3 Prompt editado/melhorado persiste em asset.prompt e é preferido pelo getPrompt
- [x] #4 Corrige pontuação duplicada nos templates de referência (filme e HQ)
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Backend: generateImagePrompt (ai.ts) reescrito — system prompt de diretor de arte: só pistas pictóricas (ignora narração/áudio/regras/influências), identidade física concreta p/ continuidade, formato model sheet (corpo inteiro + close, fundo neutro, sem texto), no idioma do projeto. Rota /generate enriquece o subject (nome+brief) e grava em asset.prompt. Frontend: StudioItem ganhou promptEditable/savePrompt/improvePrompt e apiGenerate aceita prompt. Estúdio: prompt vira textarea editável (referências) com 'Salvar' e 'Melhorar com IA' (spinner); generate envia o texto da tela e auto-persiste. getPrompt prefere asset.prompt. Corrigido ponto duplicado (helper dot) nos templates de filme e HQ. Smoke test com LLM real (Court Clerk/Fé Pública) produziu prompt limpo e específico em pt-BR.
<!-- SECTION:NOTES:END -->
