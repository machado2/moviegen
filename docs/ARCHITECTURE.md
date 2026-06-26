# Arquitetura do MediaGen

Como o código está organizado hoje. Este documento descreve o estado atual
(as-is), não um alvo futuro.

## 1. O que é

MediaGen é uma aplicação web local/single-user para **produção de mídia com IA**,
com **dois formatos** que compartilham o mesmo servidor e a mesma infraestrutura:

- **Filme** (MovieGen): roteiro → cenas → shots → takes de vídeo → montagem.
- **HQ / graphic novel** (ComicsGen): roteiro → pranchas → quadros → renders → livro.

Ambos seguem o mesmo pipeline conceitual: *parsear um roteiro com IA → produzir
referências e quadros/shots → montar o resultado final*.

## 2. Decisões transversais (valem para os dois formatos)

- **Gateway de IA único.** Toda chamada de modelo (LLM, imagem, vídeo) passa por
  um gateway LiteLLM OpenAI-compatível (`LLM_BASE_URL`, default
  `https://llm.fbmac.net/v1`). O gateway guarda as chaves dos provedores reais
  (OpenRouter, Gemini, OpenAI, Together) e roteia por nome de modelo. O app só
  troca base_url + uma chave.
- **Custo medido, nunca estimado.** O gateway devolve o custo real no header
  `x-litellm-response-cost`. Quando não vem (ex.: vídeo), o custo fica "—" — nunca
  zero/chutado. Há **teto de gasto por projeto** que pausa a geração ao ser atingido.
- **Dados em disco como Nickel + git por projeto.** Cada projeto é um diretório
  com arquivos `.ncl` (Nickel) e um repositório git próprio para histórico/restore.
  JSON é só transporte transitório; nunca é escrito em disco.
- **Jobs assíncronos com SSE.** Operações longas (parse, geração, montagem) rodam
  como jobs em memória com progresso por Server-Sent Events; o estado é journalado
  em disco para sobreviver (visivelmente) a reinícios.
- **Sem compatibilidade de formato silenciosa.** Importação valida o JSON/Nickel
  contra os tipos atuais com validadores escritos à mão e recusa com a lista
  precisa de divergências.
- **Responsividade ≤100ms** (regra em `AGENTS.md`): toda interação de UI dá
  feedback imediato (update otimista ou spinner); só o tempo de chamada externa
  não conta. Ver `docs/` e o Estúdio como referência.

## 3. Monorepo (pnpm, 4 workspaces)

```
packages/types   @mediagen/types     — tipos canônicos (o schema do formato em disco + DTOs)
packages/core    @mediagen/core      — lógica de domínio pura, compartilhada (hoje: criação de prompts)
backend          @mediagen/backend   — servidor Fastify (API + serve o SPA)
frontend         @mediagen/frontend  — SPA React (Vite + Tailwind + radix-ui)
```

`@mediagen/core` existe para **compartilhar lógica pura entre frontend e backend**
sem I/O nem framework — a única forma limpa de não duplicar regra de domínio
através da fronteira cliente/servidor. Depende só de `@mediagen/types`. É buildado
antes de backend/frontend; consumido como `workspace:*` (e listado nas deps da
raiz para ser hoistado ao `node_modules` da raiz, de onde o `dist/server.js` o
resolve em runtime).

Particularidades de build:
- `nodeLinker: hoisted` e o backend compila para o **`dist/` da raiz** (não
  `backend/dist`), então as deps de runtime resolvem do `node_modules` da raiz.
- Endurecimento de supply-chain no `pnpm-workspace.yaml`: scripts de install
  bloqueados por padrão (`onlyBuiltDependencies`), `minimumReleaseAge: 1440` (24h).
- `packages/types` é a fonte da verdade do formato; mudar um tipo lá quebra o
  build onde importa — de propósito.

## 4. Backend — camadas

O backend tem uma regra de camadas clara:

```
HTTP  ──▶  routes/        valida entrada, traduz HTTP ⇄ serviço, faz SSE/stream
          │
LÓGICA ─▶  services/      regras de negócio; orquestra storage + gateway + jobs
          │
DISCO  ─▶  storage/       único lugar que toca o filesystem (fs + Nickel + git)
```

Suporte: `lib/` (errors, ids, validate, multipart, sendfile), `jobs/` (fila +
journal), `assembly/` (ffmpeg: assemble/concat/normalize/probe).

### Dois stacks paralelos sobre a mesma base

```
backend/src/
  server.ts            bootstrap Fastify; registra tudo; serve o SPA
  config.ts  env.ts    config + carga de .env persistente

  routes/              FILME — projects, scripts, scenes, shots, takes, assets,
                       characters, assembly, cocreate, settings, allProjects
  services/            FILME — project, scene, shot, take, asset, assetgen,
                       shotgen, assembly, script, character, ai, parseAgent,
                       cocreate(+Agent), settings, spend, catalog, gateway,
                       imagegen, videogen, archive
  assembly/            ffmpeg p/ vídeo (assemble, concat, normalize, probe)

  comics/              HQ — espelho do stack acima
    routes/            projects, scripts, pranchas, quadros, renders, assets,
                       characters, assembly, index
    services/          project, prancha, quadro(render), asset, assembly,
                       script, parseAgent, ai, prompt, archive
    assembly/          montagem (composição de prancha), book (cbz/pdf/epub), probe
    layout.ts  storage.ts  validate.ts

  storage/             COMPARTILHADO — filesystem, nickel, git
  jobs/                COMPARTILHADO — queue, store (journal)
  lib/                 COMPARTILHADO — errors, ids, validate, multipart, sendfile
```

**Infra compartilhada pelos dois formatos:** `storage/*`, `jobs/*`, `lib/*`, e os
serviços de IA de filme reusados por HQ — `gateway.ts` (provider Vercel AI SDK
com captura de custo + abort no teto), `imagegen.ts` (`generateImageViaGateway`),
`videogen.ts` (`generateVideoViaGateway`, OpenAI-compat `/v1/videos`), `settings.ts`,
`spend.ts`, `catalog.ts`. HQ tem `ai.ts`/`prompt.ts`/montagem próprios.

### Registro de rotas (server.ts)

- Tudo sob **`/api/v1`** (filme) e **`/api/v1/comics`** (HQ).
- Error handler central converte `HttpError` → `ApiError` JSON.
- Se existir o build do frontend (`PUBLIC_DIR`, default `dist/public`), o mesmo
  processo **serve o SPA** com fallback para `index.html` (rotas `/api/*` não
  caem no fallback).
- `main()` inicializa storage (filme + HQ), roda `jobQueue.recover()` e sobe o Fastify.

### Jobs (`jobs/queue.ts` + `store.ts`)

- `JobQueue` em memória, single-process. `start(kind, runner, ref?)` roda já;
  `subscribe(id, cb)` alimenta SSE; `JobHandle` expõe `update(progress, message)`
  e um `AbortSignal` (cancelamento → propagado às chamadas de gateway).
- Journalado em disco (`jobs/store`): no boot, `recover()` marca como "interrompido"
  o que ficou `running` e poda registros antigos (TTL ~6h).
- `kind`s: `script-parse`, `image-generate`, `video-generate`, `render-generate`,
  `scene-assembly`, `movie-assembly`, `prancha-assembly`, `book-assembly`.

### Storage (`storage/`)

- `filesystem.ts` — **único** lugar com paths de projeto; expõe helpers
  (`projectDir`, `sceneFile`, `takeFile`, `assetsDir`, …) e `commitProject`,
  `projectHistory`, `restoreProject`.
- `nickel.ts` — codec Nickel: leitura via binário `nickel` (avalia `.ncl` → JSON
  em memória), escrita por serializer próprio (JS → Nickel).
- `git.ts` — um repo git por projeto; `commit/history/restore` best-effort
  (se git faltar, history desabilita sem quebrar).

## 5. Modelo de dados em disco (por projeto)

```
data/
  films/projects/<id>/
    project.ncl              Project (metadados, globalStyle, assets{}, índice de cenas)
    script.md                roteiro bruto
    outline.ncl              co-criação: outline/beat sheet
    cocreate-chat.ncl        transcript do chat de co-criação
    parsed-script.ncl        parse pronto-mas-não-aplicado (sobrevive a reload)
    scenes/<sceneId>.ncl     uma cena por arquivo (shots, takes[], selectedTakeId)
    assets/                  arquivos de imagem/áudio (incl. variantes <id>-<var>.png)
    takes/<scene>/<shot>/    arquivos de vídeo dos takes
    output/                  cenas/filme montados
    .git/                    histórico do projeto

  comics/projects/<id>/
    project.ncl              ComicsProject (assets{}, índice de pranchas)
    pranchas/<id>.ncl        uma prancha por arquivo (quadros, renders[], selectedRenderId)
    assets/  renders/  output/  .git/
```

**Padrão "candidatos" (uniforme nos 3 lugares):** shots têm `takes[]` +
`selectedTakeId`; quadros têm `renders[]` + `selectedRenderId`; assets de imagem
têm `variants[]` + `selectedVariantId` (com `file` espelhando o selecionado para
compatibilidade). Geração via API acumula candidato **sem** auto-selecionar;
upload seleciona; a escolha é uma ação separada.

## 6. Frontend — organização

```
frontend/src/
  main.tsx  App.tsx           shell: lista de projetos → FilmApp / ComicsApp + Settings
  FilmApp.tsx  ComicsApp.tsx  abas por formato dentro do ProjectShell (nav lateral)

  api/        client.ts (filme) + comicsClient.ts (HQ) — fetch tipado p/ a API
  hooks/      useProject, useScene, useSettings, useSpend, useAssembly,
              useAllProjects, useStudioQueue (+ hooks/comics)
  lib/        studio.ts (abstração StudioItem), prompt.ts, cost.ts,
              comicsLayout.ts, utils.ts
  components/  Estudio, Pipeline, Storyboard, ElencoCenarios, CoCreate,
               GenerateModal, SettingsPanel, ModelCombobox, ProjectShell, …
    ui/        primitivos (button, dialog, select, textarea, … sobre radix-ui)
    comics/    PranchaGrid, QuadroCard, RenderViewer, PromptPreviewModal, …
  pages/  pages/comics/
```

**A abstração central do frontend é o `StudioItem`** (`lib/studio.ts`): cada
unidade produzível (referência de personagem/cenário, shot, quadro) vira um
`StudioItem` com closures que sabem montar prompt, enviar arquivo, gerar por API,
listar/selecionar/excluir candidatos. `useStudioQueue` constrói a lista para
filme e HQ; o `Estudio` é **agnóstico de formato** e só percorre a lista. Por
isso a mesma tela de produção serve os dois mundos (e roda também dentro do
`GenerateModal`).

## 7. Fluxos-chave

- **Parse de roteiro** (`parseAgent.ts`): agente de tool-calling (Vercel AI SDK)
  que lê o `script.md` e popula a estrutura (personagens, cenas/pranchas, shots/
  quadros) via ferramentas, com heartbeat e custo; resultado fica em
  `parsed-script.ncl` até o usuário aplicar.
- **Co-criação** (`cocreateAgent.ts` + `CoCreate.tsx`): chat agentic que edita
  outline/beat sheet e "explode" beats em cenas, com painel de estrutura ao vivo.
- **Geração de imagem/vídeo**: o Estúdio chama `assets/.../generate-image`,
  `shots/.../generate-video` ou `renders/.../generate`; cada um roda um job que
  chama o gateway, grava custo e adiciona um candidato (take/render/variante).
  O prompt de referência pode ser **editado** e "melhorado com IA"
  (`generateImagePrompt` distila só o visual e fixa identidade física).
- **Montagem**: filme via ffmpeg (`assembly/`); HQ compõe a prancha e exporta
  livro (`comics/assembly/montagem.ts` + `book.ts` → cbz/pdf/epub).
- **Export/import** (`archive.ts`): ZIP do projeto em 2 variantes (estrutura /
  com mídia); import valida contra os tipos atuais e cria um projeto novo.

## 8. Runtime & deploy

- **Um único processo Fastify** serve a API (`/api/v1`, `/api/v1/comics`) e o SPA
  estático (`dist/public`) — não há servidor de frontend separado em produção.
- Empacotado em imagem Docker (`Dockerfile` + `docker-compose.yml`); `DATA_DIR`
  monta os projetos.
- Deploy: push em `master` → o homeops na VPS reconcilia (~5 min) e roda a imagem
  `homeops/mediagen:<shorthash>`.

## 9. Mapa de responsabilidades (clean code) — alvo

A diretriz é: **cada conhecimento mora num módulo claramente responsável por ele.**
Estado atual de cada responsabilidade:

| Conhecimento | Onde mora hoje | Situação |
| --- | --- | --- |
| **Criação de prompts** (texto determinístico p/ gerar imagem/vídeo) | `@mediagen/core` (`prompts/`) | ✅ consolidado — fonte única usada por front+back |
| **Schema do formato em disco** | `@mediagen/types` | ✅ fonte única |
| **Persistência / formato em disco** (layout de arquivos, codec Nickel, git, validação, load/save por agregado) | `storage/{filesystem,nickel,git}` + `lib/validate.ts` + load/save embutido em `services/{project,scene,asset,...}` | ⚠️ parcial — paths/codec/git isolados, mas o load/save e a validação ainda estão espalhados pelos serviços. **Próximo módulo a consolidar.** |
| **Inferência / IA** (chamadas ao gateway) | `services/{gateway,imagegen,videogen,ai}` + agentes (`parseAgent`, `cocreateAgent`) | ✅ razoavelmente coeso |
| **Orquestração de geração** (job: prompt + IA + persistência) | `services/{assetgen,shotgen}`, `comics/services/assembly` | ✅ |
| **Montagem / render final** | `assembly/` (ffmpeg) e `comics/assembly/` (montagem, book) | ✅ |
| **HTTP** | `routes/` e `comics/routes/` | ✅ |
| **UI** | `frontend/` (Estúdio agnóstico via `StudioItem`) | ✅ |

A geração de prompt **por LLM** (`services/ai.ts generateImagePrompt`) fica no
backend de propósito: não é determinística (é uma chamada de inferência); ela
*usa* o gateway e pode partir do template puro de `@mediagen/core`.

### Próximo passo definido: o módulo de "formato em disco"

Formalizar uma camada de **persistência (repository)** que seja a única dona do
formato em disco: paths + codec + git + **validação** + **load/save por agregado**
(Project, Scene, Prancha, Asset/variantes, Take, Render). Os serviços passam a
pedir entidades a essa camada e nunca tocam `fs`/Nickel/paths diretamente. Isso
separa "como o dado é guardado" de "regra de negócio sobre o dado".

## 10. Convenções

- **Backlog.md** para tarefas (ver `CLAUDE.md`); não editar os `.md` de tarefa à mão.
- Tipos canônicos em `packages/types`; validadores em `lib/validate.ts` e
  `comics/validate.ts`.
- Erros via `HttpError` (`lib/errors.ts`) → `ApiError` no handler central.
- IDs e timestamps por `lib/ids.ts` (`newId`, `nowIso`).
