---
id: TASK-21
title: 'Arquitetura: deduplicar primitivas de storage por projeto (storage/repo.ts)'
status: Done
assignee: []
created_date: '2026-06-26 14:54'
updated_date: '2026-06-26 14:54'
labels: []
dependencies: []
ordinal: 30000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
comics/storage.ts reimplementava resolveInProject/commitProject/projectHistory/restoreProject/listProjectIds idênticos ao filesystem.ts (só muda o diretório base). Extrair o plumbing genérico.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 storage/repo.ts com resolveInRoot/commitDir/historyDir/restoreDir/listDirs sobre um diretório absoluto
- [x] #2 filesystem.ts (filme) e comics/storage.ts delegam; layout de paths segue por stack
- [x] #3 Runtime ok: commit por save, history e resolve via delegação (smoke 4/4)
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Criado storage/repo.ts (zip-slip guard + best-effort git + listDirs sobre dir absoluto). filesystem.ts e comics/storage.ts delegam resolveInProject/commitProject/projectHistory/restoreProject/listProjectIds; removidos imports git/fs órfãos. Smoke 4/4: history com commits após create, serve 200 (resolveInRoot), history cresce após upload.
<!-- SECTION:NOTES:END -->
