---
id: TASK-10.2
title: 'Modelo de dados: outline/beat sheet + thread de chat persistido'
status: Done
assignee:
  - '@claude'
created_date: '2026-06-26 00:43'
updated_date: '2026-06-26 01:01'
labels: []
dependencies: []
parent_task_id: TASK-10
priority: high
ordinal: 12000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Introduzir um artefato de Outline (logline, tema/themes, atos -> beats) e um thread de chat de co-criação persistido por projeto, ambos em disco via o serializador Nickel (.ncl) como o resto. Tipos novos em @mediagen/types (lembrar de rebuildar o pacote types antes do typecheck do backend). Rotas backend de leitura/escrita do outline e do thread. Sem quebrar o formato atual de Project/Scene.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Tipo Outline (logline, tema, atos->beats) em @mediagen/types e serializado em .ncl
- [x] #2 Thread de chat de co-criação persistido por projeto em .ncl
- [x] #3 Rotas backend para ler e gravar outline e thread de chat
- [x] #4 Tipos buildados; typecheck de backend e frontend passam
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Tipos em @mediagen/types: Outline (logline, themes, acts[]->beats[] com sceneNumbers ligando à Scene.number) e ChatThread (messages[] com role/content/toolEvents/createdAt). Storage: outline.ncl e cocreate-chat.ncl via writeNickel/readNickel (round-trip validado, atos→beats aninhados + arrays preservados; só a ordem de chaves muda, alfabética, sem perda). Serviço cocreate.ts: getOutline/saveOutline (normaliza acts/beats, gera ids faltantes, commita), getChatThread/saveChatThread/appendChatMessage (gera msg ids)/clearChatThread (preserva outline). Rotas cocreate.ts: GET/PUT /projects/:id/outline, GET/DELETE /projects/:id/cocreate/chat; registradas no server.ts. Validado end-to-end com projeto real em DATA_DIR temp. types build + backend/frontend typecheck OK.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Adicionado o modelo de dados da co-criação: artefato Outline (atos→beats, ligando a cenas) e ChatThread, ambos persistidos em .ncl por projeto, com serviço de CRUD normalizado e rotas de leitura/escrita. Round-trip Nickel e fluxo end-to-end validados; typechecks passam.
<!-- SECTION:FINAL_SUMMARY:END -->
