---
id: TASK-3
title: Persistir LLM_API_KEY no host para o parse sobreviver a reinícios
status: In Progress
assignee:
  - '@claude'
created_date: '2026-06-25 13:53'
updated_date: '2026-06-25 14:45'
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
- [x] #1 LLM_API_KEY (e opcionalmente LLM_BASE_URL) fica setada de forma persistente para o processo do servidor mediagen neste host
- [ ] #2 Após reiniciar host/serviço, GET /api/v1/settings reporta apiKeyFromEnv=true e um parse funciona sem intervenção manual
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Carregar um .env persistente em todos os modos de execução (dev, pnpm start, serviço) — antes hoje só o wrapper de shell do 'dev' fazia source de ../.env; produção (node dist/server.js) ignorava. 2. Unit systemd com EnvironmentFile=.env para sobreviver a reboot. 3. Documentar setup no host. 4. Passo manual restante: criar .env com a chave real do gateway e instalar o serviço (precisa do segredo).
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Enabler de código entregue: backend/src/env.ts (loader .env zero-dependência, importado primeiro em server.ts; busca .env subindo do cwd ou DOTENV_PATH; nunca sobrescreve env real) — agora um .env persistente e gitignored é autoritativo em dev, 'pnpm start' e no serviço. dev script simplificado (removido o source de shell redundante). deploy/mediagen.service (EnvironmentFile=/home/fabio/src/mediagen/.env, enable --now sobrevive a reboot) e deploy/README.md com o passo a passo. .env.example atualizado. Loader testado (parsing de aspas/export, var pré-definida vence, valor vazio). Typecheck e build passam.

PENDENTE (passo manual no host, precisa do segredo): criar /home/fabio/src/mediagen/.env com LLM_API_KEY=<chave do gateway LiteLLM> (chmod 600) e instalar o systemd unit. Não tenho a chave do gateway — a settings.ncl atual só tem um 'openrouterApiKey' antigo (pré-migração LiteLLM), que não é o llmApiKey usado hoje. AC#1/AC#2 só podem ser verificados após esse passo.

Verificado no host vmmint: o usuário exportou LLMLITE_API_KEY no ~/.bashrc, mas o app lê LLM_API_KEY — nome diferente, então com a env do bashrc o servidor reportava apiKeyFromEnv=false/hasApiKey=false e o parse quebraria; além disso ~/.bashrc não é lido por systemd/shell não-interativo. Solução: criado .env (gitignored, chmod 600) com LLM_API_KEY=<chave> e DATA_DIR=/shared/mediagen. Testes: (1) servidor lendo só o .env -> GET /api/v1/settings retorna apiKeyFromEnv=true/hasApiKey=true (hint …B6nL); (2) GET https://llm.fbmac.net/v1/models com a chave -> HTTP 200 (chave valida). A chave agora sobrevive a restart do processo/serviço sem intervenção manual. Opcional: instalar o systemd unit (sudo) para auto-subir o servidor após reboot do host.
<!-- SECTION:NOTES:END -->

## Comments

<!-- COMMENTS:BEGIN -->
author: @claude
created: 2026-06-25 14:28
---
Código/infra de persistência prontos e commitados. Falta um passo manual que exige o segredo: criar o .env com a chave real do gateway LiteLLM e instalar o serviço (deploy/README.md). Me passe a chave (ou rode os comandos do README) para fechar os ACs. Obs.: a data/settings.ncl tem um 'openrouterApiKey' antigo exposto (arquivo 777) que não é mais usado — recomendo rotacioná-lo/removê-lo.
---
<!-- COMMENTS:END -->
