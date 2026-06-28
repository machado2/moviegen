---
id: TASK-38.6
title: 'HQ: modo de render por prancha — página inteira (A) vs painéis+montagem (B)'
status: Done
assignee:
  - '@codex'
created_date: '2026-06-27 23:49'
updated_date: '2026-06-28 18:50'
labels:
  - pipeline
  - backend
  - comics
dependencies: []
modified_files:
  - packages/types/src/comics.ts
  - packages/core/src/prompts/comics.ts
  - backend/src/comics/services/assembly.ts
  - backend/src/comics/services/render.ts
  - backend/src/comics/routes/renders.ts
  - backend/src/comics/services/prancha.ts
  - backend/src/comics/routes/pranchas.ts
  - frontend/src/api/comicsClient.ts
  - frontend/src/pages/comics/Pranchas.tsx
  - frontend/src/pages/comics/Publication.tsx
parent_task_id: TASK-38
priority: medium
ordinal: 53000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Suportar os DOIS modos de gerar a arte da página, com trade-off forte:
- Modo B (atual): cada quadro é gerado separado e o montagem.py encaixa nos slots do layout. Bom para iterar/regerar um painel e layout determinístico; ruim no visual de grade rígida e na deriva de estilo entre painéis adjacentes.
- Modo A (novo): a prancha inteira é gerada numa tacada. Coesão artística da página (luz/estilo/personagens), layouts orgânicos (splash, sangria, sobreposição); ruim de iterar (refaz a página pra corrigir 1 painel) e layout não-determinístico.

Forma limpa: a TRANSFORMAÇÃO (cena→quadros+layout) é fonte única e alimenta os dois — no Modo B cada quadro é unidade de geração; no Modo A a lista de quadros+layout vira o spec/prompt da página e a PRANCHA é a unidade (carrega candidatos, reusando a máquina de variantes de storage/variants.ts). INVARIANTE: toda prancha termina com uma imagem final de página; A gera direto, B monta via montagem.py; export/book é agnóstico ao modo.

Decisão em aberto (recomendação): renderMode 'page'|'panels' POR PRANCHA, com padrão de projeto e sugestão automática por layout (splash/1-2 painéis → page; grade densa → panels).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 renderMode por prancha ('page' | 'panels') com padrão de projeto e sugestão por layout
- [x] #2 Modo A gera a prancha inteira; a prancha carrega candidatos (reusa variants)
- [x] #3 Modo B segue como hoje (quadros + montagem.py)
- [x] #4 Invariante: toda prancha termina com uma imagem final de página; export/book é agnóstico ao modo
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Adicionar renderMode por prancha com padrão panels e opt-in page.\n2. Adicionar candidatos de página inteira na prancha e rotas/client para gerar, selecionar, visualizar e remover.\n3. Fazer a montagem final respeitar o modo: panels usa montagem.py, page copia o candidato selecionado para a página final.\n4. Expor controles na UI de Pranchas e ajustar status de Publicação.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
DECISÃO (usuário): padrão = 'panels' (atual, montagem programática, não mexe no que funciona) + opt-in 'page' por prancha. ADIADO por orientação do usuário (não implementar HQ agora).

Implemented Prancha.renderMode ('panels' default, 'page' opt-in), pageRenders/selectedPageRenderId, page render generation through the same image gateway/codex path, and assembly behavior for both modes. Publication status and Pranchas UI now expose the mode and page candidates. Validation passed: pnpm typecheck; pnpm build; python3 -m py_compile backend/src/comics/assembly/montagem.py.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Added per-prancha panels/page render modes, full-page render candidates, mode-aware assembly, and UI controls. Verified with typecheck, build, and Python syntax check.
<!-- SECTION:FINAL_SUMMARY:END -->
