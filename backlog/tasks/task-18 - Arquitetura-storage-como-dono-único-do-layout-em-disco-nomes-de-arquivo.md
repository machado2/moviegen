---
id: TASK-18
title: 'Arquitetura: storage como dono único do layout em disco (nomes de arquivo)'
status: Done
assignee: []
created_date: '2026-06-26 14:21'
updated_date: '2026-06-26 14:22'
labels: []
dependencies: []
ordinal: 27000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Continuação do rumo clean-code. O esquema de nomes de arquivo (assets/<id>-<var>.<ext>, <take>.<ext>, <render>.<ext>) estava sendo construído dentro dos serviços — formato vazando. Mover para a camada de storage.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Helpers de nome/caminho (assetRelPath, takeFilename, renderFilename) vivem no storage (filme + HQ)
- [x] #2 Serviços (asset/take/render, filme e HQ) não constroem mais strings de caminho/nome de arquivo
- [x] #3 Comportamento preservado (nomes idênticos) e backend compila
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
filesystem.ts (filme) e comics/storage.ts ganharam safeExt + assetRelPath(assetId,variantId,originalName) + takeFilename/renderFilename. asset.ts/take.ts (filme) e comics asset.ts/render.ts passam a chamar esses helpers em vez de montar strings. Validado por equivalência determinística da dist (nomes idênticos ao inline antigo) + build verde + servidor sobe. Doc atualizado: storage owns layout+codec+git+naming; load/save já são repos finos (project/scene/prancha). Validators ficam em lib/validate.ts (misturam formato + saída do parser, não é mudança limpa mover).
<!-- SECTION:NOTES:END -->
