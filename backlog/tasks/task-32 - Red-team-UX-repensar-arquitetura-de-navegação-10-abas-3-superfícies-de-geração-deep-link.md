---
id: TASK-32
title: >-
  Red-team UX: repensar arquitetura de navegação (10 abas, 3 superfícies de
  geração, deep-link)
status: Done
assignee: []
created_date: '2026-06-27 20:39'
updated_date: '2026-06-27 21:23'
labels:
  - redteam
  - ux
  - frontend
  - architecture
dependencies: []
priority: medium
ordinal: 41000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Mudança de produto (precisa de decisão do usuário). Colapsar/agrupar as 10 abas de topo; eleger uma superfície canônica de geração (Estúdio) e tratar Storyboard/Elenco como visões que 'abrem no Estúdio' em vez de geradores paralelos; aproximar Configurações (modelo) do ponto de uso (parse/gerar); adicionar URL/deep-link para projeto+aba (refresh/voltar resumem posição); mostrar título do projeto no header; consolidar export num lugar; decidir Co-criar na HQ.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Navegação agrupada/reduzida com ordem clara do fluxo
- [ ] #2 Uma superfície canônica de geração; demais telas linkam para ela
- [ ] #3 Projeto+aba (e item em foco) refletidos na URL e resumíveis em refresh/voltar
- [ ] #4 Título do projeto visível no header; export consolidado
<!-- AC:END -->
