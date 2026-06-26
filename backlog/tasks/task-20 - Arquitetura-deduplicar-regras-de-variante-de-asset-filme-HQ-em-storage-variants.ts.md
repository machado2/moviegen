---
id: TASK-20
title: >-
  Arquitetura: deduplicar regras de variante de asset (filme/HQ) em
  storage/variants.ts
status: Done
assignee: []
created_date: '2026-06-26 14:48'
updated_date: '2026-06-26 14:49'
labels: []
dependencies: []
ordinal: 29000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Os dois asset.ts (filme e HQ) duplicavam ~150 linhas de regras de variante quase idênticas, onde moram as partes sutis (id legado estável, status, limpar seleção ao excluir). Extrair as regras puras para um módulo compartilhado.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 storage/variants.ts com regras puras: migrateVariants, syncSelectedFile, recordVariant, selectVariant, removeVariant, listVariantFiles
- [x] #2 Filme e HQ asset.ts usam o módulo; load/save/commit e layout de arquivo seguem explícitos por stack
- [x] #3 Comportamento idêntico verificado por smoke (upload/list/select/delete + migração legada, filme e HQ): 15/15
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Criado backend/src/storage/variants.ts (puro, sobre VariantAsset estrutural; Asset e ComicsAsset são assignáveis). As regras de variante saíram dos dois asset.ts: migrate/sync/record/select/remove/listFiles + LEGACY_VARIANT_ID num lugar só. Callers mantêm load(getProject)/save(saveProject)/commit e o assetRelPath (layout por stack). Smoke 15/15: upload acumula+seleciona, upload novo re-seleciona, select, delete mantém/limpa seleção, serve, e migração legada (var_legacy estável + serve) — filme e HQ.
<!-- SECTION:NOTES:END -->
