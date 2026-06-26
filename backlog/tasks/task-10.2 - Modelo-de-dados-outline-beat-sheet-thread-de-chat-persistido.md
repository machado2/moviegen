---
id: TASK-10.2
title: 'Modelo de dados: outline/beat sheet + thread de chat persistido'
status: To Do
assignee: []
created_date: '2026-06-26 00:43'
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
- [ ] #1 Tipo Outline (logline, tema, atos->beats) em @mediagen/types e serializado em .ncl
- [ ] #2 Thread de chat de co-criação persistido por projeto em .ncl
- [ ] #3 Rotas backend para ler e gravar outline e thread de chat
- [ ] #4 Tipos buildados; typecheck de backend e frontend passam
<!-- AC:END -->
