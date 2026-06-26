---
id: TASK-13
title: >-
  Export em 2 variantes (estrutura / com mídia) + Importar na UI (aceita projeto
  incompleto)
status: Done
assignee:
  - '@claude'
created_date: '2026-06-26 02:11'
updated_date: '2026-06-26 02:21'
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
- [x] #1 Export oferece duas opções: 'estrutura' (só .ncl + script.md) e 'completo' (com mídia)
- [x] #2 Botão Importar na tela inicial aceita zip e cria o projeto; funciona para filme e HQ
- [x] #3 Importar aceita projeto incompleto (sem cenas/pranchas, assets pendentes) sem erro
- [x] #4 Round-trip validado: exportar (estrutura) e reimportar preserva a estrutura; backend+frontend typecheck/build
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Export: exportProjectZip(projectId, {includeMedia}) no filme e na HQ. Estrutura (includeMedia=false) = project.ncl (redigido) + script.md + scenes/ (ou pranchas/) + .ncl soltos da raiz (outline.ncl, cocreate-chat.ncl, parsed-script.ncl); completo adiciona as pastas de mídia (filme: assets/takes/output; HQ: assets/renders/output). Rotas: ?media=structure (default full); filename ganha sufixo -estrutura. Clients (film+comics): export/exportUrl aceitam {media}. UI: duas opções de export nas duas Overviews; botão Importar + diálogo (toggle Filme/HQ + file input) na ProjectList, chamando o import certo, recarregando e abrindo o projeto. Doc docs/projetos-em-disco.md explicando layout em disco, que a web lê sem cache (Claude Code reconhecido ao recarregar) e o fluxo local→VPS. Round-trip validado no servidor real: export estrutura do filme traz project.ncl+outline.ncl+scenes/*.ncl (sem mídia), reimport preserva outline+cena; HQ exporta/importa; import de projeto VAZIO/inacabado OK; export completo segue válido. typecheck+build OK.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Export em duas variantes (estrutura só-.ncl / completo com mídia) no filme e na HQ, e botão Importar na tela inicial (aceita zip, inclusive projeto inacabado). Habilita o round-trip local↔VPS; a web já lê o disco sem cache, então trabalho feito via Claude Code é reconhecido. Doc do fluxo incluído. Round-trip validado no servidor real.
<!-- SECTION:FINAL_SUMMARY:END -->
