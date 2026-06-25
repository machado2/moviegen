# MediaGen — Especificação de UX/UI

> Visão de produto e desenho de interface, repensados do zero. Não está preso à
> implementação atual (abas, modal de revisão de parse, import de JSON). Onde
> divergir do que existe hoje, a seção **O que muda** no fim mapeia a transição.

---

## 1. Filosofia de produto

O usuário é um **diretor / showrunner** dirigindo uma equipe de produção de IA.
O app não é um formulário onde se preenchem campos — é um **assistente de
produção** que, a cada instante, sabe em que ponto o projeto está e oferece a
próxima ação mais útil.

Quatro princípios norteiam todo o desenho:

1. **Pipeline sobre navegação.** A estrutura de telas segue a sequência natural
   de produção (roteiro → referências → cenas → montagem), não uma taxonomia de
   entidades. O usuário avança no trabalho, não navega por abas arbitrárias.

2. **Um app, dois meios.** Filme e HQ são o **mesmo fluxo** — projeto, roteiro,
   personagens e cenários, uma sequência de unidades atômicas de geração, várias
   tentativas por unidade, montagem final. A interface é única e parametrizada
   pelo meio; só os rótulos e o passo final (vídeo vs. livro) mudam. Não há
   "dois apps" nem um seletor de meio na navegação.

3. **Geração incremental com freio.** Produz-se **um item de cada vez**, com
   revisão imediata. Nunca se gasta crédito em lote antes de perceber um erro. A
   geração automática é fortemente limitada por taxa e sempre interrompível com
   um clique.

4. **Versionado por padrão.** Cada projeto é um repositório git. Toda alteração
   significativa vira um commit automático. Revisão é olhar o histórico;
   desfazer é restaurar uma versão. **Nenhum popup pede confirmação antes de
   salvar** — salvar é o caminho normal; o git é a rede de segurança.

---

## 2. Modelo conceitual unificado

Por baixo dos rótulos, filme e HQ compartilham exatamente a mesma estrutura. A
interface fala a língua do meio, mas o motor é um só.

| Conceito unificado          | Filme                     | HQ                          |
|-----------------------------|---------------------------|-----------------------------|
| **Projeto**                 | Filme                     | HQ                          |
| **Roteiro**                 | Roteiro (markdown)        | Roteiro (markdown)          |
| **Referência — pessoa**     | Personagem                | Personagem                  |
| **Referência — lugar**      | Cenário / Local           | Cenário / Local             |
| **Sequência**               | Cena                      | Prancha                     |
| **Unidade de geração**      | Shot                      | Quadro                      |
| **Tentativa**               | Take                      | Render                      |
| **Montagem final**          | Vídeo (mp4)               | Livro (CBZ / PDF / EPUB)    |

A peça central é a **unidade de geração**: qualquer coisa que precise virar uma
imagem ou um vídeo. Isso inclui **as referências** (a folha de referência de um
personagem, a imagem de um cenário) **e os shots/quadros**. Todas as unidades —
de qualquer tipo — vivem numa **fila de produção** única do projeto. É essa
unificação que permite uma única tela de geração servir para tudo.

Cada unidade tem:
- um **prompt derivado** dos campos estruturados (o usuário edita os campos, não
  o texto do prompt — fonte única de verdade);
- zero ou mais **anexos de referência** (imagens que precisam ser anexadas
  junto, p. ex. o rosto canônico de um personagem num quadro que ele aparece);
- uma lista **aditiva de tentativas** (nunca destrutiva) e uma tentativa
  selecionada;
- um **estado**: `pendente` · `aguardando revisão` · `pronto` · `pulado` ·
  `falhou`.

---

## 3. Arquitetura de informação

```
Home — lista de projetos
└── Projeto
    ├── Pipeline        — painel de estado (a "visão geral")
    ├── Roteiro         — texto + histórico
    ├── Estúdio         — ★ a tela de geração, o coração do app
    ├── Elenco & Cenários — biblioteca de referências (navegar / revisar)
    ├── Storyboard      — visão espacial das sequências e unidades
    ├── Montagem        — saída final (vídeo / livro)
    └── Histórico       — linha do tempo git (também por ícone de relógio)
```

A navegação primária é uma **barra lateral fixa** (rail) com esses destinos. Não
há abas de entidade (Overview / Characters / Assets / Scenes / Assembly) como
navegação de topo. As entidades são acessadas **pelo trabalho**: o Estúdio
produz, o Storyboard organiza, a Biblioteca cataloga.

Um cabeçalho fino e persistente mostra: nome do projeto, badge do meio, **custo
acumulado da sessão**, ícone de histórico (relógio) e engrenagem de
configurações. Sem seletor de meio — o meio é propriedade do projeto.

---

## 4. Home — lista de projetos

Lista única de todos os projetos (filmes e HQs), ordenada por edição mais
recente. Cada item:

- Título
- Badge de tipo (Filme / HQ)
- **Barra de progresso do pipeline** com legenda do estágio atual
  (ex.: "Produção — 8/34 shots prontos")
- Data da última edição

`Novo projeto` → diálogo: tipo (Filme / HQ) → título → cria e abre direto no
Pipeline. `Importar projeto` aceita um `.ncl`/bundle (ver §12). Nenhum outro
toggle ou seletor de meio.

---

## 5. Pipeline — painel de estado do projeto

Substitui completamente o sistema de abas. Painel vertical com as etapas em
sequência, cada uma com estado e atalho de ação:

```
●  Roteiro          roteiro.md · 3 atos · parse aplicado          [abrir]
◐  Personagens      4 / 12 prontos                                [produzir →]
○  Cenários         0 / 5
○  Shots            0 / 34
○  Montagem         —
```

Ícones: `●` pronto · `◐` em progresso · `○` bloqueado/não iniciado.

A etapa em progresso mais recente fica **expandida** por padrão, com um preview
do item atual e o botão de ação que leva ao Estúdio já posicionado nesse item.
Clicar em qualquer etapa abre a tela correspondente. **O pipeline É a visão
geral** — não existe aba "Overview".

Metadados globais do projeto (título, estilo global, método/princípios,
restrições, idioma) ficam num painel recolhível "Configurações do projeto" no
topo do Pipeline — editáveis inline, cada edição vira commit `edit: <campo>`.

---

## 6. Roteiro

- **Visualização** do markdown em modo leitura, com realce das sluglines
  (`EXT. BREJO - DAWN`, `PRANCHA 14`, etc.).
- **Carregar roteiro** substitui o arquivo e commita `roteiro: atualizado`.
- **Parsear com IA** roda em background (job assíncrono, progresso via barra
  discreta no topo — o usuário navega livremente enquanto roda). Ao terminar,
  **aplica automaticamente** a estrutura e commita
  `parse: N cenas · M personagens`. **Não há modal de revisão.** O volume é
  grande demais para revisar num popup; o mecanismo de revisão é o histórico
  git — se o parse ficou ruim, restaura-se a versão anterior.
- Barra lateral direita: **histórico do roteiro** (commits que tocaram roteiro/
  parse), cada um com data, descrição automática e botão restaurar.
- Reparsing é seguro e idempotente do ponto de vista do usuário: gera um novo
  commit; o anterior continua restaurável.

---

## 7. Estúdio — o coração do app

Uma única tela, parametrizada pelo tipo de unidade, que percorre a **fila de
produção** do projeto. Serve para personagens, cenários, shots e quadros — tudo.
Tem dois modos: **Manual** (cola/upload pelo usuário) e **API** (geração
automática com freio).

### 7.1 A fila e a ordenação

O app **decide sozinho a próxima coisa que falta** gerar, respeitando
dependências e relevância:

1. **Referências antes do que as usa.** Personagens e cenários vêm antes dos
   shots/quadros que os referenciam — assim um quadro já pode anexar o rosto
   canônico correto.
2. **Mais relevante primeiro.** Entre referências, as mais citadas no roteiro
   (protagonistas) antes das secundárias e figurantes. Entre shots/quadros,
   ordem narrativa.
3. **Pula o que já está pronto** e o que foi explicitamente pulado.

A fila é **derivada** (não armazenada) do estado das unidades + grafo de
dependência + contagem de referências. O usuário pode **reordenar arrastando** e
**pular** itens; esses overrides são persistidos por unidade (prioridade /
flag de pulado). Uma trilha lateral fina mostra a fila e permite saltar para
qualquer item.

### 7.2 Layout

```
┌──────────────────────────────────────────────────────────────────────┐
│ ← Pipeline   Personagens · "Dr. Euclides"   (3/12)        [⚡ API]   │
├───────────────────────────────────┬──────────────────────────────────┤
│  PROMPT  (pronto para colar)       │  RESULTADO                       │
│  ────────────────────────────      │  ─────────                       │
│  Folha de referência de personagem │   ┌──────────────────────────┐   │
│  "Dr. Euclides": homem ~60 anos,   │   │                          │   │
│  …descrição canônica completa…     │   │   cole ou arraste a      │   │
│  Estilo: {estilo global}           │   │   imagem aqui            │   │
│                                    │   │   (ou ⤓ enviar arquivo)  │   │
│  [📋 Copiar prompt]                │   │                          │   │
│                                    │   └──────────────────────────┘   │
│  ANEXOS DE REFERÊNCIA (2)          │                                  │
│  [thumb rosto] [thumb corpo]       │   [↻ refazer]  [→ pular]         │
│  ⤓ baixar todos · arraste p/ o     │                                  │
│    seu gerador                     │  ┌─ último colado ────┐          │
│                                    │  │ [thumb]  Marta ✓   │ ← clique │
│  [⚡ Gerar com API →]              │  └────────────────────┘  p/ rever│
└───────────────────────────────────┴──────────────────────────────────┘
                              trilha da fila: ●●●◐○○○○○○○○
```

### 7.3 Modo Manual — o laço de colar

- **Painel esquerdo: prompt.** Texto completo e **auto-contido**, montado a
  partir dos campos estruturados da unidade (estilo global, descrição canônica,
  composição, textos do quadro, restrições). Pode ser colado direto no ChatGPT,
  Midjourney, etc. Botão **Copiar prompt** com confirmação visual.
  - O prompt é **derivado e somente-leitura**. Para ajustar, há **"editar
    campos"**, que abre os campos estruturados inline (composição, descrição,
    textos) — o prompt se re-deriva ao vivo. Isso preserva a fonte única de
    verdade: nunca se edita o texto solto.
  - **Anexos de referência:** quando a unidade depende de imagens (um quadro com
    personagens já gerados), elas aparecem como uma **tira de miniaturas** sob o
    prompt, com "baixar todos" e arrastáveis. O prompt textual descreve as
    referências, e os anexos suprem o que texto não carrega. É isso que torna a
    unidade verdadeiramente auto-contida para colar numa ferramenta externa.

- **Painel direito: resultado.** Uma zona de **colar/arrastar imagem**. Ao
  receber uma imagem (Ctrl/Cmd-V ou drop):
  1. Salva imediatamente como nova **tentativa** (take/render) da unidade e a
     seleciona.
  2. Commita no git: `asset: personagem/euclides` ou `render: prancha 3 · q2`.
  3. **Avança automaticamente** para a próxima unidade na fila.
  4. A miniatura do que acabou de ser colado vai para o **canto "último
     colado"**.

- **Canto "último colado".** Sempre visível, mostra a miniatura do último
  resultado. **Clicar nele abre um painel de revisão lateral** (sem sair da
  tela) sobre aquela unidade: ver em tamanho grande, comparar tentativas,
  **substituir/refazer**, ou marcar como definitiva. É o "voltar para conferir
  se fiz algo errado" — barato e a um clique, sem perder o lugar na fila.

- **Atalhos de teclado** (o laço é feito sem tirar a mão do teclado):
  `Ctrl/Cmd-V` cola e avança · `←` volta uma unidade · `→` pula · `R` refaz a
  atual · `C` copia o prompt · `Espaço` abre a revisão do último.

### 7.4 Shots de vídeo e quadros de HQ

A mesma tela, com a única diferença no canal de entrada do resultado:

- **Quadro de HQ:** zona aceita **colar imagem** (paste) — fluxo descrito acima.
  O prompt inclui composição, personagens presentes, cenário e **os textos do
  quadro** (balões, legendas, SFX) formatados por tipo, separados visualmente do
  resto para não poluir.
- **Shot de vídeo:** vídeo não é colável no browser, então a zona aceita
  **upload de arquivo** (`.mp4`) em vez de paste — drag-and-drop de arquivo ou
  botão. O prompt descreve câmera, ação, personagens presentes, falas e estilo.
  A miniatura no histórico usa o frame inicial do vídeo.

### 7.5 Modo API — geração automática com freio

O botão **⚡ Gerar com API** troca o painel direito por um **painel de
controle**:

```
●  Gerando: Dr. Euclides — folha de referência
──────────────────────────────────────────────
Limite de taxa: 1 a cada 60 s          [ajustar]
Próximo em: 0:43          Custo na sessão: $0.42
──────────────────────────────────────────────
        [ ■  PARAR GERAÇÃO ]   ← grande, vermelho
```

- Gera **um item por vez**, respeitando um **rate-limit forte** (padrão 1/min,
  ajustável). O objetivo é dar tempo de perceber um erro antes de gastar em
  dezenas de itens errados.
- Cada resultado aparece na zona como **se o usuário tivesse colado**: fica
  visível alguns segundos, vira tentativa selecionada, commita, e a fila avança.
  O canto "último colado" funciona igual — dá para abrir e refazer no meio.
- **Botão Parar grande e vermelho**, sempre visível. Ao parar, o modo volta para
  **Manual na unidade atual**.
- **Custo visível**: custo acumulado da sessão e, quando disponível, estimativa
  por item. Pausa automática opcional ao atingir um teto de gasto configurável.
- Em caso de falha de um item: marca `falhou`, registra o erro, **não avança em
  cascata** — pausa para o usuário decidir (refazer / pular / parar).

---

## 8. Elenco & Cenários — a biblioteca de referências

A fonte única de verdade, em modo **navegação** (o Estúdio é o modo
**produção**). Grade de cards de personagens e cenários:

- Miniatura da referência selecionada (ou estado "pendente").
- Nome e descrição canônica (editável inline → commit `edit: …`).
- Estado: pronto / pendente / pulado.
- Ações por card: **Produzir** (abre o Estúdio focado nesta unidade),
  **Substituir** (nova tentativa), **Ver tentativas**.

Sem tabela de "assets" crua exposta ao usuário com IDs e roles internos — isso é
detalhe de implementação. O usuário pensa em "personagens" e "cenários", não em
`character-face` vs `character-body`. (Os múltiplos slots por personagem, quando
existirem, aparecem como abas dentro do card: Rosto · Corpo · Voz.)

---

## 9. Storyboard — visão espacial das sequências

Onde o Estúdio é sequencial (um item por vez), o Storyboard é **espacial**: vê-se
o conjunto e salta-se para qualquer ponto.

- **Filme:** cenas empilhadas; dentro de cada uma, os shots como uma **fita
  horizontal** de miniaturas (frame inicial do take selecionado). Clicar num
  shot → revisão / enviar ao Estúdio.
- **HQ:** pranchas; cada prancha renderizada no seu **layout real** (grid 2x2,
  rows-3, etc.) com os quadros posicionados. É ao mesmo tempo o storyboard e o
  preview da montagem. Clicar num quadro → revisão / refazer.

Cada miniatura mostra o estado da unidade (pronto / pendente / aguardando
revisão). É a ponte entre "ver o todo" e "consertar um item".

---

## 10. Montagem — a saída final

- **Filme:** lista de cenas com seus shots em ordem, **player integrado** para
  preview, e **Montar vídeo** (roda o pipeline ffmpeg no backend, progresso via
  SSE). Estado por cena: não montada / montada / desatualizada (quando um take
  selecionado mudou).
- **HQ:** preview das pranchas em sequência e exportação **CBZ / PDF / EPUB**.
  Opções de montagem (gutter, fundo, fit, dimensões) ficam num painel de
  parâmetros; alterá-las só remonta as pranchas, não regera quadros.

Habilita-se a montagem quando todas as unidades da sequência têm tentativa
selecionada. Botões de download para os artefatos finais. Toda exportação que
seja "dados" usa **Nickel** como formato intermediário, nunca JSON (§12).

---

## 11. Histórico & versionamento

Cada projeto é um **repositório git** na pasta de dados
(`data/{films|comics}/projects/{id}/`). O app faz commits automáticos:

| Evento                  | Mensagem de commit                       |
|-------------------------|------------------------------------------|
| Roteiro atualizado      | `roteiro: atualizado`                    |
| Parse aplicado          | `parse: ${n} cenas · ${m} personagens`   |
| Tentativa salva         | `asset: ${tipo}/${id}` / `render: …`     |
| Campo editado           | `edit: ${campo}`                         |
| Unidade adicionada      | `shot: cena ${n} · shot ${m}`            |
| Montagem gerada         | `montagem: ${alvo}`                      |

A tela **Histórico** mostra a linha do tempo navegável: data, descrição,
thumbnail quando houver, e **Restaurar** (faz `git checkout` daquela versão num
novo commit, então restaurar também é reversível). Um ícone de relógio no
cabeçalho dá acesso ao histórico de qualquer tela. Como o formato em disco é
texto (Nickel + markdown), os diffs são legíveis e o usuário que quiser pode
versionar/clonar a pasta com git "de verdade".

---

## 12. Formatos de arquivo — Nickel, nunca JSON

- **Em disco:** Nickel (`.ncl`) para toda estrutura, markdown para roteiro,
  arquivos de mídia nativos para imagem/vídeo/áudio.
- **Importar / exportar:** um arquivo `.ncl` ou um bundle de pasta. A ação no
  menu se chama **"Importar projeto"** / **"Exportar projeto"** — sem a palavra
  JSON.
- **JSON não aparece em nenhuma interface visível ao usuário.** É apenas
  transporte interno (HTTP, SSE) e a forma como o `nickel` exporta para o backend
  ler. Nunca é um formato que o usuário vê, cola, importa ou exporta. O botão
  "Importar JSON estruturado" deixa de existir.

---

## 13. Estados, custos e erros (transversal)

- **Estados de unidade** são visíveis em todo lugar com a mesma linguagem
  (`pendente`/`aguardando revisão`/`pronto`/`pulado`/`falhou`) e os mesmos
  ícones.
- **Custo** é cidadão de primeira classe: acumulado da sessão sempre no
  cabeçalho; por item no modo API; teto opcional com pausa automática. A
  filosofia do freio só funciona se o gasto está sempre à vista.
- **Erros** nunca somem num toast efêmero: a unidade que falhou guarda a
  mensagem e oferece refazer/pular. Jobs assíncronos (parse, montagem)
  sobrevivem a reload — a UI se re-vincula ao job em andamento.
- **Estados vazios** orientam a próxima ação ("Nenhum roteiro ainda —
  carregue um `.md` ou cole o texto"), nunca uma tela morta.

---

## 14. Teclado & acessibilidade

- O **laço do Estúdio é operável só pelo teclado** (colar/avançar/voltar/pular/
  refazer/copiar) — é a operação mais repetitiva do app e merece ser fluida.
- Foco visível, navegação por tab coerente com a ordem visual, alvos de toque
  generosos no botão de Parar.
- O app roda em LAN (já suportado) — o desenho assume também uso em tablet para
  o laço de colar/revisar.

---

## 15. O que muda em relação ao app atual

**Desaparece:**
- Navegação por abas de entidade (Overview / Characters / Assets / Scenes /
  Assembly; Visão Geral / Personagens / Assets / Pranchas / Publicação) como
  navegação primária → vira a rail orientada a pipeline.
- **Modal de revisão de parse** (`ScriptImportModal`) antes de salvar → parse
  aplica direto e commita; revisão é o histórico git.
- Botão **"Importar JSON estruturado"** e qualquer superfície com a palavra JSON
  → import/export é `.ncl`.
- Toggle Films/Comics no header e seletor de meio → meio é do projeto (já em
  parte feito).
- Tabela de assets crua com roles internos → vira "Elenco & Cenários".

**Aparece / muda:**
- **Estúdio**: tela única de geração iterativa para todas as unidades, com laço
  de colar, anexos de referência, modo API com rate-limit e botão de parar, e o
  canto "último colado" para revisão a um clique. Hoje a geração está espalhada
  (botões por card em `CharacterCard`, `AssetCard`, `ShotCard`, `QuadroCard`) e
  não há fila, nem paste, nem modo API com freio para filme.
- **Versionamento git por projeto** com commits automáticos e tela de histórico.
  Hoje não existe histórico nenhum — sobrescrever é destrutivo.
- **Fila de produção derivada** (dependências + relevância) guiando a ordem de
  geração — hoje inexistente.
- **Custo sempre visível** e teto de gasto — hoje inexistente.

**Aproveita o que já existe (sem reescrever o motor):**
- Tentativas aditivas (`takes`/`renders`) e tentativa selecionada já modelam a
  revisão não-destrutiva.
- `status: pending/active` dos assets já mapeia para a fila.
- Jobs assíncronos com SSE e re-vínculo após reload já suportam parse/montagem
  em background.
- Storage Nickel e o codec já estão prontos; falta só remover as superfícies de
  JSON e renomear import/export.
- O backend já é medium-agnóstico no core (Project, asset library, unidade
  atômica, tentativas) — a unificação de UI proposta acompanha o motor.

---

## 16. Status de implementação

Acompanha o que já foi construído desta especificação (atualizado conforme o
trabalho avança).

**Pronto e validado:**
- **Versionamento git por projeto** (§11): cada projeto vira um repositório git;
  commits automáticos em todos os pontos de mutação (criação, edição, parse
  aplicado, asset/take/render salvos, montagem); rotas `GET …/history` e
  `POST …/restore`. Restore reconstrói a árvore exata do commit (reverte
  modificações, restaura deleções, remove adições) e é registrado como novo
  commit reversível. Testado em runtime para filme e HQ.
- **Tela de Histórico** (§11): linha do tempo navegável com restaurar, nos dois
  meios.
- **Parse sem popup** (§6): o parse aplica e versiona automaticamente ao
  terminar; o modal de revisão foi removido. Progresso inline.
- **JSON fora da interface** (§12): removidos os botões "Importar JSON
  estruturado" e os modais; import/export rotulados como "projeto".
- **Estúdio** (§7): tela única de geração para personagens, cenários, shots e
  quadros, com fila ordenada (referências antes das unidades), prompt
  auto-contido + cópia, tira de anexos de referência, colar-para-avançar
  (imagem) / upload (vídeo), canto "último colado" com revisão, navegação por
  teclado, e **modo API com rate-limit forte + botão de parar** (geração de
  quadros via codex na HQ).
- **Pipeline dashboard** (§5): visão inicial com estados por etapa e atalhos
  para o Estúdio/Montagem, derivada da mesma fila do Estúdio.

**Ainda por fazer:**
- Converter a barra de abas em rail lateral persistente (hoje é uma barra de
  abas já ordenada por pipeline).
- Storyboard espacial (§9) e renomear as tabelas de assets para "Elenco &
  Cenários" (§8).
- Persistir overrides de ordem/pular por unidade na fila (§7.1).
- Rastreio de custo real por item (§13) — depende de expor custo nas chamadas de
  geração.

---

## 17. Modelo de dados — implicações

A maior parte do desenho cabe no modelo atual. O que ele pede de novo:

- **Repo git por projeto** + uma camada fina de commit automático nos eventos da
  tabela em §11 (e leitura do log para a tela de Histórico).
- **Overrides de fila por unidade**: um `priority?: number` e um `skipped?:
  bool` (ou equivalente) para persistir reordenação e "pular"; a ordem-base
  continua derivada.
- **Custo por tentativa** quando gerada via API (`costUsd?`, `tokens?`) para
  alimentar o acumulado e o teto.
- **Teto de gasto e rate-limit** nas configurações (globais, com a chave
  OpenRouter e os modelos).

Nada disso quebra o princípio de "tipos TypeScript são o formato": são adições
aditivas, e o compilador continua achando todos os callsites.
