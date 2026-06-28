---
id: TASK-38.7
title: 'HQ: lettering programático a partir de QuadroText (fork de design)'
status: To Do
assignee: []
created_date: '2026-06-27 23:49'
updated_date: '2026-06-28 17:46'
labels:
  - pipeline
  - comics
  - design
dependencies: []
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
- [ ] #1 Decisão registrada: lettering assado vs programático (e impacto nos modos de render)
- [ ] #2 Se programático: balões/legendas/sfx renderizados a partir de QuadroText, com tipos e acentuação corretos, sem assar texto no gerador
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
ADIADO por orientação do usuário: não implementar HQ por ora.
<!-- SECTION:NOTES:END -->
