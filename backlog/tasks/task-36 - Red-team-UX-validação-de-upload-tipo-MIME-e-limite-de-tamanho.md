---
id: TASK-36
title: 'Red-team UX: validação de upload (tipo/MIME) e limite de tamanho'
status: Done
assignee: []
created_date: '2026-06-27 20:39'
updated_date: '2026-06-27 21:12'
labels:
  - redteam
  - backend
  - frontend
dependencies: []
priority: medium
ordinal: 45000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
readUpload aceita qualquer byte/mimetype; drop de vídeo pega files[0] sem checar; limite de 2GB. Arquivo inválido só falha lá na montagem (ffmpeg críptico). Validar MIME/extensão contra o tipo esperado (imagem vs vídeo) no upload, rejeitar cedo com mensagem clara, e baixar/streamar o limite.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Upload valida MIME/extensão contra o tipo esperado e rejeita cedo com mensagem clara
- [ ] #2 Limite de tamanho reduzido/adequado (não 2GB irrestrito)
<!-- AC:END -->
