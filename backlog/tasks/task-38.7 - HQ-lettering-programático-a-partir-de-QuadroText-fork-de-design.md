---
id: TASK-38.7
title: 'HQ: lettering programático a partir de QuadroText (fork de design)'
status: Done
assignee:
  - '@codex'
created_date: '2026-06-27 23:49'
updated_date: '2026-06-28 18:50'
labels:
  - pipeline
  - comics
  - design
dependencies: []
modified_files:
  - packages/core/src/prompts/comics.ts
  - backend/src/comics/assembly/montagem.py
  - backend/src/comics/assembly/montagem.ts
  - backend/src/comics/services/assembly.ts
  - docs/pipeline.md
parent_task_id: TASK-38
priority: low
ordinal: 54000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Hoje o texto é ASSADO na imagem pelo gerador (montagem.py: 'No lettering is done here — texts are baked into the renders'), e modelo de imagem letra mal. Avaliar/implementar lettering PROGRAMÁTICO: sobrepor balões/legendas/onomatopeias a partir do QuadroText (guardado verbatim, com tipo: dialogue/caption/sfx/…).

Interação com os modos de render: lettering programático combina com o Modo B (sabemos a caixa de cada painel); no Modo A é mais difícil (sem caixas de painel) a menos que o modelo marque regiões. É a decisão vizinha mais importante: texto fica assado (mantém A e B simétricos) ou vira camada programática (empurra peso pro Modo B). Esta tarefa é o fork — decidir e, se for o caso, implementar.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Decisão registrada: lettering assado vs programático (e impacto nos modos de render)
- [x] #2 Se programático: balões/legendas/sfx renderizados a partir de QuadroText, com tipos e acentuação corretos, sem assar texto no gerador
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Registrar a decisão: lettering programático para panels; texto embutido no modo page.\n2. Ajustar prompt de quadro para não assar texto no render por painel.\n3. Fazer montagem.py desenhar balões/legendas/SFX a partir de QuadroText.\n4. Validar TypeScript, build e sintaxe Python.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
ADIADO por orientação do usuário: não implementar HQ por ora.

Decision: panels mode uses programmatic lettering from QuadroText; page mode keeps baked-in text because the full-page image has no deterministic panel boxes. quadroPrompt now instructs the image model not to draw text for panel renders. montagem.py draws dialogue/offscreen/voice-over bubbles, captions/sign/title boxes, and SFX overlays with Unicode-capable font fallback. Validation passed: pnpm typecheck; pnpm build; python3 -m py_compile backend/src/comics/assembly/montagem.py.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Implemented programmatic lettering for panel montage and documented the panels/page decision. Verified with typecheck, build, and Python syntax check.
<!-- SECTION:FINAL_SUMMARY:END -->
