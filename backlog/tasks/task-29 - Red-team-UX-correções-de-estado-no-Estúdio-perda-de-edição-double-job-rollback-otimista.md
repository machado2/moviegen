---
id: TASK-29
title: >-
  Red-team UX: correções de estado no Estúdio (perda de edição, double-job,
  rollback otimista)
status: Done
assignee: []
created_date: '2026-06-27 20:38'
updated_date: '2026-06-27 20:47'
labels:
  - redteam
  - frontend
  - bug
dependencies: []
priority: high
ordinal: 38000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Lote de correções de correção de estado no Estudio.tsx: (H6) effect de prompt com dep no objeto current apaga edição não salva em qualquer refresh -> usar currentKey e respeitar promptDirty; (H7) double-generate/double-improve por guarda via estado React -> guarda síncrona com useRef; (M5) select de candidato otimista não reverte em falha -> restaurar selectedId; reorder parcial deixa servidor meio-trocado -> onRefresh no finally ou swap atômico; skip em falha já avançou o foco -> só avançar após sucesso; (M10) prompt '(falha ao montar o prompt: ...)' não pode virar prompt de geração -> estado de erro separado e desabilitar Gerar/Salvar; (M11) erro ao listar candidatos não pode colapsar para vazio -> erro distinto.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Edição de prompt não é descartada por refresh em background (effect keyed em currentKey + guarda promptDirty)
- [ ] #2 Clique-duplo real não dispara dois jobs (guarda síncrona via ref) em Gerar e Melhorar com IA
- [ ] #3 Select de candidato reverte em falha; reorder reflete a verdade do servidor após falha; skip só avança após persistir
- [ ] #4 Prompt em estado de falha de montagem não é gerável nem salvável
- [ ] #5 Erro ao listar candidatos é distinto do estado vazio
<!-- AC:END -->
