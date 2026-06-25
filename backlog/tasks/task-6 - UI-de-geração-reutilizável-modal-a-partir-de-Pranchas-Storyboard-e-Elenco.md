---
id: TASK-6
title: 'UI de geração reutilizável (modal) a partir de Pranchas, Storyboard e Elenco'
status: Done
assignee:
  - '@claude'
created_date: '2026-06-25 15:07'
updated_date: '2026-06-25 17:10'
labels:
  - frontend
  - ux
dependencies: []
priority: medium
ordinal: 6000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
As outras telas devem abrir a MESMA UI de geração do Estúdio (prompt + colar/arrastar/gerar por API + anexos) num modal, em vez de fluxos separados (ex.: QuadroCard hoje tem geração própria). Extrair o 'workbench' de um item do Estúdio para um componente reutilizável e abri-lo num modal a partir dos cards. Refs: frontend/src/components/Estudio.tsx, frontend/src/components/comics/QuadroCard.tsx, frontend/src/pages/comics/Pranchas.tsx, frontend/src/components/Storyboard.tsx, frontend/src/components/ElencoCenarios.tsx.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 O workbench de geração de um item é um componente reutilizável compartilhado pelo Estúdio e por um modal
- [x] #2 Pranchas, Storyboard e Elenco têm um botão 'Gerar' que abre esse modal para o item, sem sair da tela
- [x] #3 Salvar/gerar no modal atualiza a tela de origem; typecheck e build passam
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
O Estúdio ganhou modo 'embedded' (esconde fila/seletor/navegação) = workbench de um item reutilizável. Novo GenerateModal envolve o Estúdio embedded num Dialog. Apps (Film/Comics) mantêm um único GenerateModal e passam onGenerate(item) p/ as telas: Storyboard e Elenco abrem o modal no clique/botão 'Gerar'; Pranchas/QuadroCard ganhou botão 'Gerar no Estúdio' (resolve o StudioItem do quadro via studioItems e abre o modal). Salvar/gerar no modal chama genRefresh (recarrega fila + spend). Removida a navegação antiga 'produzir → aba Estúdio' desses cards. Typecheck e build OK.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Extraído o workbench de geração do Estúdio (modo embedded) e exposto num GenerateModal reutilizável. Pranchas, Storyboard e Elenco abrem a MESMA UI de geração (prompt + colar/arrastar/gerar por API com escolha de modelo) num modal, sem sair da tela; o resultado atualiza a tela de origem.
<!-- SECTION:FINAL_SUMMARY:END -->
