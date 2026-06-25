---
id: TASK-3
title: Persistir LLM_API_KEY no host para o parse sobreviver a reinícios
status: To Do
assignee: []
created_date: '2026-06-25 13:53'
labels:
  - ops
  - config
dependencies: []
references:
  - backend/src/config.ts
  - backend/src/services/settings.ts
priority: medium
ordinal: 3000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
O mediagen roda nesta VM (vmmint, LAN 192.168.15.9). O servidor :3000 hoje recebe LLM_API_KEY do env do processo que o inicia (efêmero) — um reinício da VM/serviço perde a key e o parse/geração quebram até setar de novo. Persistir (env de unit systemd, um .env carregado pelo process manager, ou o mecanismo de deploy) para a chave do gateway sobreviver a reinícios. O base do gateway já tem default público no config.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 LLM_API_KEY (e opcionalmente LLM_BASE_URL) fica setada de forma persistente para o processo do servidor mediagen neste host
- [ ] #2 Após reiniciar host/serviço, GET /api/v1/settings reporta apiKeyFromEnv=true e um parse funciona sem intervenção manual
<!-- AC:END -->
