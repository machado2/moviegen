---
id: TASK-13
title: >-
  Export em 2 variantes (estrutura / com mídia) + Importar na UI (aceita projeto
  incompleto)
status: To Do
assignee: []
created_date: '2026-06-26 02:11'
labels: []
dependencies: []
priority: high
ordinal: 17000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Suportar o fluxo: criar/editar o projeto localmente (inclusive via Claude Code editando os arquivos Nickel), exportar e enviar para a VPS, e continuar gerando mídia pela web. (1) Export em duas variantes: 'estrutura' (só arquivos .ncl + script.md, SEM mídia de assets/takes/output) e 'completo' (com toda a mídia gerada). (2) Botão Importar projeto na tela inicial (ProjectList), aceitando zip — inclusive de projeto inacabado (sem cenas, assets pendentes). Vale para filme e HQ. O import já existe no backend e valida estrutura (não completude); só falta a UI e a variante de export. Confirmar que o web reconhece projeto editado direto no disco (já lê do disco sem cache).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Export oferece duas opções: 'estrutura' (só .ncl + script.md) e 'completo' (com mídia)
- [ ] #2 Botão Importar na tela inicial aceita zip e cria o projeto; funciona para filme e HQ
- [ ] #3 Importar aceita projeto incompleto (sem cenas/pranchas, assets pendentes) sem erro
- [ ] #4 Round-trip validado: exportar (estrutura) e reimportar preserva a estrutura; backend+frontend typecheck/build
<!-- AC:END -->
