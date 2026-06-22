# ComicsGen — AI Graphic Novel Production Web Application

## Overview

ComicsGen é uma extensão do MovieGen para produção de HQs e graphic novels geradas por IA. Gerencia o pipeline completo: de um roteiro carregado, à decomposição estruturada prancha a prancha, à geração de quadros individuais, à montagem programática de pranchas, e à publicação final em CBZ, PDF e EPUB. O modelo de dados é baseado no trabalho de campo realizado no projeto *Fé Pública* (versão v8 — quadros individuais com montagem programática).

---

## Core Concepts

### Hierarquia

```
Project (HQ)
  ├── Assets (biblioteca central — personagens, estilo, cenários)
  └── Pranchas (lista ordenada)
        └── Prancha
              └── Quadros (lista ordenada, com slot de layout)
                    ├── Renders (múltiplas tentativas, nunca deletadas)
                    └── selectedRenderId (qual render usar na montagem)
```

### Princípios de Design

1. **TypeScript em tudo.** O formato estruturado é definido como tipos TypeScript. Se o formato muda, o compilador encontra cada ponto de uso. Sem camadas de compatibilidade retroativa.

2. **A biblioteca de assets é a fonte única de verdade.** Personagens, referências de estilo e cenários são definidos uma vez com um `id`. Quadros referenciam assets por `id` — nunca os redefinem.

3. **O quadro é a unidade atômica de geração.** Cada quadro é uma imagem independente, com textos (balões, legendas, SFX) já integrados pelo gerador. A montagem posterior só posiciona os quadros no canvas.

4. **Renders são aditivos, nunca destrutivos.** Toda tentativa de geração ou upload é mantida como render. O usuário escolhe o melhor. Nada é sobrescrito.

5. **Layout é determinístico.** O template de layout (`rows-2`, `grid-2x2`, `top-then-grid-2x2`, etc.) determina número de quadros, posições e proporções. Alterar gutter, cor de fundo ou algoritmo de fit exige apenas remontar as pranchas, sem regerar quadros.

6. **Textos entram no quadro pelo gerador.** Balões, legendas, SFX e placas são instruídos ao modelo de imagem dentro do prompt de cada quadro — não são sobrepostos programaticamente. A montagem não faz lettering.

7. **Sem compatibilidade de formato.** Os tipos TypeScript correntes são o formato. Projetos antigos que não corresponderem devem ser migrados ou reimportados manualmente.

---

## Technology Stack

| Camada | Tecnologia | Justificativa |
|---|---|---|
| Linguagem | TypeScript (strict mode) | Segurança de tipos na evolução do formato |
| Backend | Node.js + Fastify | Servidor HTTP leve e rápido |
| Frontend | React 18 + Vite | HMR rápido, build leve |
| UI components | shadcn/ui + Tailwind CSS | Componentes acessíveis sem estilo fixo |
| Armazenamento | Sistema de arquivos local | Simples, portável em Docker |
| Banco de dados | SQLite via Drizzle ORM | Leve, sem servidor externo |
| AI (parse de roteiro) | OpenRouter API | Agnóstico de modelo; usuário traz a própria chave |
| AI (geração de quadros) | codex image_gen (via CLI) | Mesmo pipeline usado em produção no Fé Pública |
| Montagem de pranchas | Pillow (Python) via processo filho | Composição de imagens com gutter e fit configuráveis |
| Publicação | img2pdf / ebooklib | Geração de CBZ, PDF e EPUB a partir das pranchas |
| Containerização | Docker + Docker Compose | Deploy em um comando |

---

## Data Model

Todos os tipos ficam em `packages/types/src/comics.ts`. Backend e frontend importam daqui.

```typescript
// ─── Project ──────────────────────────────────────────────────────────────────

export interface ComicsProject {
  id: string;
  title: string;
  language: string;          // BCP-47, e.g. "pt-BR"
  createdAt: string;         // ISO 8601
  updatedAt: string;

  globalStyle: string;       // instrução de estilo aplicada a todos os quadros
  restrictions: string[];    // regras globais "nunca fazer", uma por entrada

  assets: Record<string, ComicsAsset>;
  pranchas: PranchaRef[];    // índice ordenado; cada prancha é um arquivo separado
}

// ─── Assets ───────────────────────────────────────────────────────────────────

export type ComicsAssetType = 'image';

export type ComicsAssetRole =
  | 'character'        // referência visual de personagem (rosto + corpo no estilo da HQ)
  | 'style-reference'  // página/imagem de referência de estilo (como prancha_001.png no Fé Pública)
  | 'location';        // referência visual de cenário

export type ComicsAssetStatus =
  | 'active'    // pronto para uso
  | 'pending'   // ainda não gerado/carregado
  | 'external'; // referência provisória de fora do projeto

export interface ComicsAsset {
  id: string;
  type: ComicsAssetType;
  role: ComicsAssetRole;
  status: ComicsAssetStatus;
  file: string | null;          // caminho relativo à raiz do projeto, null se pendente
  characterName?: string;       // para assets de personagem: nome canônico
  characterDescription?: string; // descrição canônica: idade, etnia, figurino, postura
  description?: string;         // notas legíveis por humano
}

// ─── Pranchas ─────────────────────────────────────────────────────────────────

export type PranchaLayout =
  | 'rows-1'              // 1 quadro splash, proporção 2:3 (página inteira)
  | 'rows-2'              // 2 quadros horizontais, proporção 4:3 cada
  | 'rows-3'              // 3 quadros panorâmicos, proporção 2:1 cada
  | 'rows-4'              // 4 quadros muito panorâmicos, proporção 3:1 cada
  | 'grid-2x2'            // 4 quadros verticais, proporção 2:3 cada (2 colunas × 2 linhas)
  | 'grid-2x3'            // 6 quadros quadrados, proporção 1:1 cada (2 colunas × 3 linhas)
  | 'grid-2x4'            // 8 quadros quadrados, proporção 1:1 cada (2 colunas × 4 linhas)
  | 'top-then-grid-2x2';  // 1 panorâmico (2:1) + 4 quadrados (1:1)

export interface PranchaRef {
  id: string;
  number: number;
  shortTitle: string;  // rótulo legível: "Cartório — Manhã"
  file: string;        // caminho relativo para o JSON da prancha
}

export interface Prancha {
  id: string;
  number: number;
  shortTitle: string;  // corresponde a PranchaRef.shortTitle
  origin: string;      // referência ao roteiro: "roteiro/ato_um.md · PRANCHA 14"
  layout: PranchaLayout;
  quadros: Quadro[];
}

// ─── Quadros ──────────────────────────────────────────────────────────────────

export type QuadroSlotFormat =
  | 'vertical de página inteira, proporção 2:3'    // rows-1
  | 'horizontal alto, proporção 4:3'               // rows-2
  | 'horizontal panorâmico, proporção 2:1'         // rows-3 / top-then-grid-2x2 (slot 1)
  | 'horizontal muito panorâmico, proporção 3:1'   // rows-4
  | 'vertical, proporção 2:3'                      // grid-2x2
  | 'quadrado, proporção 1:1';                     // grid-2x3 / grid-2x4 / top-then-grid-2x2 (slots 2-5)

export type QuadroTextType =
  | 'dialogue'       // balão de fala (personagem no quadro)
  | 'offscreen'      // balão de fala vindo de fora do quadro (O.S.)
  | 'voice-over'     // balão de fala em off (V.O.) / voz de narrador
  | 'caption'        // legenda de narração
  | 'sfx'            // onomatopeia
  | 'sign'           // texto de placa, cartaz ou objeto diegético
  | 'title';         // título visual na imagem (arte)

export interface QuadroText {
  type: QuadroTextType;
  speaker?: string;  // nome do personagem, quando aplicável
  text: string;      // texto literal, com acentuação e pontuação exatas
}

export interface Quadro {
  id: string;
  order: number;
  slotFormat: QuadroSlotFormat;   // determinado pelo layout da prancha
  composition: string;            // descrição visual da cena (enquadramento, ação, postura)
  characters: string[];           // ids dos assets de personagem presentes neste quadro
  setting: string;                // local + atmosfera (luz, temperatura, textura)
  texts: QuadroText[];            // todos os textos que devem aparecer no quadro
  restrictions: string[];         // restrições específicas deste quadro (além das globais)
  refs: string[];                 // ids de assets anexados ao prompt (além dos characters)

  selectedRenderId: string | null;
  renders: Render[];
}

// ─── Renders ──────────────────────────────────────────────────────────────────

export interface Render {
  id: string;
  quadroId: string;
  createdAt: string;           // ISO 8601
  filename: string;            // caminho relativo sob renders/ do quadro
  fileSizeBytes: number;
  widthPx: number | null;      // null até inspecionado
  heightPx: number | null;
  source: 'generated' | 'upload';
  generationPrompt?: string;   // prompt completo enviado ao gerador
  notes?: string;
}

// ─── Characters ───────────────────────────────────────────────────────────────

// Vista derivada — calculada a partir dos assets, não armazenada separadamente.
export interface ComicsCharacter {
  id: string;               // e.g. "nivaldo"
  name: string;             // nome de exibição: "Nivaldo Pimenta"
  description: string;      // descrição canônica de aparência
  assetId: string | null;   // id do asset de personagem vinculado
}

// ─── Script Import ────────────────────────────────────────────────────────────

// Resultado intermediário do parse de IA — o que o LLM retorna antes de o
// usuário revisar e confirmar, tornando-o a estrutura do projeto.
export interface ParsedComicsScript {
  title: string;
  language: string;
  globalStyle: string;
  characters: ParsedComicsCharacter[];
  pranchas: ParsedPrancha[];
}

export interface ParsedComicsCharacter {
  id: string;
  name: string;
  description: string;
}

export interface ParsedPrancha {
  number: number;
  shortTitle: string;
  origin: string;
  layout: PranchaLayout;
  quadros: ParsedQuadro[];
}

export interface ParsedQuadro {
  order: number;
  slotFormat: QuadroSlotFormat;
  composition: string;
  characterIds: string[];
  setting: string;
  texts: QuadroText[];
  restrictions: string[];
}

// ─── Assembly Options ─────────────────────────────────────────────────────────

export type MontagemFit = 'contain' | 'cover';

export interface MontagemOptions {
  gutterPx: number;          // espaço entre quadros em pixels (default: 48)
  background: string;        // cor de fundo/gutter (default: "black")
  fit: MontagemFit;          // 'contain' (default, preserva quadro inteiro) ou 'cover'
  canvasWidth: number;       // largura do canvas final em px (default: 1800)
  canvasHeight: number;      // altura do canvas final em px (default: 2700)
}
```

---

## Slot Format por Layout

O formato do slot é determinado automaticamente pelo layout da prancha:

| Layout | Quadros | Formato de cada slot |
|---|---|---|
| `rows-1` | 1 | `vertical de página inteira, proporção 2:3` |
| `rows-2` | 2 | `horizontal alto, proporção 4:3` |
| `rows-3` | 3 | `horizontal panorâmico, proporção 2:1` |
| `rows-4` | 4 | `horizontal muito panorâmico, proporção 3:1` |
| `grid-2x2` | 4 | `vertical, proporção 2:3` |
| `grid-2x3` | 6 | `quadrado, proporção 1:1` |
| `grid-2x4` | 8 | `quadrado, proporção 1:1` |
| `top-then-grid-2x2` | 5 | slot 1: `horizontal panorâmico, proporção 2:1`; slots 2-5: `quadrado, proporção 1:1` |

Ao criar um quadro, o `slotFormat` é preenchido automaticamente com base no layout e na posição do quadro. O usuário não seleciona o formato manualmente.

---

## Filesystem Layout

Todos os dados do projeto são armazenados sob `DATA_DIR` configurável (default: `./data`).

```
data/
  projects/
    {projectId}/
      project.json               ← ComicsProject (sem dados de prancha)
      script.md                  ← roteiro original carregado (opcional)
      pranchas/
        {pranchaId}.json         ← Prancha (inclui quadros + metadados de renders)
      assets/
        {assetId}.{ext}          ← arquivos de asset reais (imagens PNG/JPEG)
      renders/
        {pranchaId}/
          {quadroId}/
            {renderId}.png       ← renders de quadros
      output/
        pranchas/
          {pranchaId}.png        ← prancha montada programaticamente
        book.cbz                 ← livro final em CBZ
        book.pdf                 ← livro final em PDF
        book.epub                ← livro final em EPUB
```

Metadados dos renders (id, createdAt, source, etc.) ficam no JSON da prancha. Apenas os arquivos PNG ficam em `renders/`.

---

## API Specification

Base path: `/api/v1/comics`

Todos os corpos de requisição e resposta são JSON, exceto onde indicado. Uploads de arquivos usam `multipart/form-data`.

### Projects

| Método | Caminho | Descrição |
|---|---|---|
| `POST` | `/projects` | Criar novo projeto de HQ |
| `GET` | `/projects` | Listar todos os projetos |
| `GET` | `/projects/:id` | Obter metadados do projeto |
| `PUT` | `/projects/:id` | Atualizar metadados (título, estilo, restrições, etc.) |
| `DELETE` | `/projects/:id` | Deletar projeto e todos os dados |
| `GET` | `/projects/:id/export` | Baixar projeto completo como `.zip` |
| `POST` | `/projects/import` | Importar projeto de `.zip` |

### Script

| Método | Caminho | Descrição |
|---|---|---|
| `POST` | `/projects/:id/script` | Carregar roteiro markdown (armazena o arquivo, não parseia) |
| `POST` | `/projects/:id/script/parse` | Parsear roteiro armazenado com IA → `ParsedComicsScript` |
| `POST` | `/projects/:id/script/apply` | Aplicar `ParsedComicsScript` ao projeto (cria pranchas, quadros, personagens) |
| `POST` | `/projects/:id/structured-import` | Importar JSON no formato `ComicsProject` diretamente (pula parse de IA) |

### Characters

| Método | Caminho | Descrição |
|---|---|---|
| `GET` | `/projects/:id/characters` | Listar personagens derivados dos assets |
| `GET` | `/projects/:id/characters/:charId` | Obter personagem com asset vinculado |

### Assets

| Método | Caminho | Descrição |
|---|---|---|
| `GET` | `/projects/:id/assets` | Listar todos os assets |
| `POST` | `/projects/:id/assets` | Criar registro de asset (só metadados) |
| `GET` | `/projects/:id/assets/:assetId` | Obter metadados do asset |
| `PUT` | `/projects/:id/assets/:assetId` | Atualizar metadados do asset |
| `DELETE` | `/projects/:id/assets/:assetId` | Deletar asset |
| `POST` | `/projects/:id/assets/:assetId/upload` | Carregar arquivo para o asset |
| `GET` | `/projects/:id/assets/:assetId/file` | Baixar arquivo do asset |

### Pranchas

| Método | Caminho | Descrição |
|---|---|---|
| `GET` | `/projects/:id/pranchas` | Listar pranchas (do índice PranchaRef) |
| `POST` | `/projects/:id/pranchas` | Criar prancha |
| `GET` | `/projects/:id/pranchas/:pranchaId` | Obter prancha completa (com quadros) |
| `PUT` | `/projects/:id/pranchas/:pranchaId` | Atualizar metadados da prancha |
| `DELETE` | `/projects/:id/pranchas/:pranchaId` | Deletar prancha |
| `POST` | `/projects/:id/pranchas/reorder` | Reordenar pranchas |

### Quadros

| Método | Caminho | Descrição |
|---|---|---|
| `POST` | `/projects/:id/pranchas/:pranchaId/quadros` | Adicionar quadro |
| `PUT` | `/projects/:id/pranchas/:pranchaId/quadros/:quadroId` | Atualizar quadro |
| `DELETE` | `/projects/:id/pranchas/:pranchaId/quadros/:quadroId` | Deletar quadro |
| `POST` | `/projects/:id/pranchas/:pranchaId/quadros/reorder` | Reordenar quadros |

### Renders

| Método | Caminho | Descrição |
|---|---|---|
| `GET` | `/projects/:id/pranchas/:pranchaId/quadros/:quadroId/renders` | Listar renders |
| `POST` | `/projects/:id/pranchas/:pranchaId/quadros/:quadroId/renders` | Upload de render (PNG) |
| `POST` | `/projects/:id/pranchas/:pranchaId/quadros/:quadroId/renders/generate` | Gerar render via IA |
| `GET` | `/projects/:id/pranchas/:pranchaId/quadros/:quadroId/renders/:renderId` | Servir imagem do render |
| `DELETE` | `/projects/:id/pranchas/:pranchaId/quadros/:quadroId/renders/:renderId` | Deletar render |
| `PUT` | `/projects/:id/pranchas/:pranchaId/quadros/:quadroId/selected-render` | Selecionar render para montagem |

### Assembly

| Método | Caminho | Descrição |
|---|---|---|
| `POST` | `/projects/:id/pranchas/:pranchaId/assemble` | Montar prancha a partir dos renders selecionados |
| `GET` | `/projects/:id/pranchas/:pranchaId/output` | Servir imagem da prancha montada |
| `POST` | `/projects/:id/assemble` | Montar livro final a partir das pranchas montadas |
| `GET` | `/projects/:id/output/:format` | Baixar livro final (`cbz`, `pdf`, ou `epub`) |

### Prompt Preview

| Método | Caminho | Descrição |
|---|---|---|
| `POST` | `/projects/:id/pranchas/:pranchaId/quadros/:quadroId/prompt` | Montar e retornar o prompt completo para o quadro |

Todos os endpoints de assembly retornam um job ID imediatamente e rodam de forma assíncrona. Progresso via SSE:

```
GET /projects/:id/jobs/:jobId/progress   (text/event-stream)
```

---

## AI Integration

### OpenRouter API Key

Cada projeto armazena sua própria `OPENROUTER_API_KEY` no filesystem. Nunca retornada ao frontend em nenhuma resposta de API — só um booleano `hasApiKey` é exposto.

### Script Parsing

Quando o usuário carrega um roteiro markdown e solicita o parse, o backend:

1. Lê o `script.md` armazenado.
2. Envia ao OpenRouter com um prompt de saída estruturada pedindo um `ParsedComicsScript` JSON.
3. O modelo padrão é `google/gemini-2.5-pro` (configurável por projeto).
4. Retorna o `ParsedComicsScript` ao frontend para revisão.
5. O usuário chama `/script/apply` para confirmar e criar a estrutura.

O prompt instrui o LLM a:
- Extrair personagens com descrições canônicas de aparência.
- Decompor cada prancha em quadros com número adequado para o layout inferido.
- Determinar o layout adequado (ver tabela: 1 quadro → `rows-1`, 2 → `rows-2`, etc.).
- Preservar textos de roteiro verbatim com acentuação e pontuação exatas.
- Tipificar cada texto (balão, legenda, SFX, placa, etc.).
- Identificar quais personagens aparecem em cada quadro.
- Descrever composição e cenário de cada quadro em prosa imagética.

### Geração de Quadros

Quando o usuário solicita geração de um quadro, o backend:

1. Monta o prompt completo do quadro (ver seção Prompt Assembly abaixo).
2. Invoca `codex exec` com a ferramenta `image_gen` de forma não-interativa.
3. Aguarda a conclusão e recupera o PNG do rollout da sessão codex.
4. Armazena o PNG em `renders/{pranchaId}/{quadroId}/{renderId}.png`.
5. Cria o registro `Render` no JSON da prancha.

A geração roda como processo filho Node.js. O job ID é retornado imediatamente; progresso via SSE.

---

## Prompt Assembly

O prompt de cada quadro é montado pelo backend a partir dos campos estruturados do `Quadro`, `Prancha` e `ComicsProject`. O usuário nunca edita o prompt diretamente — edita os campos estruturados e o prompt é derivado.

### Estrutura do Prompt

```
Caso de uso: ilustração narrativa
Tipo de imagem: quadro individual de HQ, {slotFormat}, estilo graphic novel

Pedido principal: Crie o quadro {order} da prancha {pranchaNumber} da graphic novel "{title}". Este é um quadro final de publicação, não um roteiro e não um esboço. A prancha final será montada depois, então gere somente este quadro como arte completa.

Composição do quadro: {composition}

A proporção e orientação do quadro devem obedecer ao formato indicado acima. Mantenha balões, legendas, placas e onomatopeias dentro de uma área segura, afastados das bordas do quadro.

Textos do quadro, literalmente:
{texts — formatados por tipo}

Observação de lettering: quando uma linha indicar quem fala, essa identificação é apenas instrução de produção. Dentro do balão, legenda, placa ou onomatopeia, escreva somente o texto entre aspas.

Personagens: {characters — descrições canônicas}

Cenário e estilo: {setting}. {globalStyle}

Montagem: o quadro deve preencher todo o retângulo da imagem, sem moldura externa desenhada, sem borda própria e sem margem branca ao redor. Os gutters da página serão criados depois por montagem programática.

Restrições de texto: os textos listados devem estar legíveis em português, com acentos e pontuação corretos.

{restrictions — restrições globais + específicas do quadro}
```

### Formatação dos Textos

Cada `QuadroText` é convertido para uma linha no prompt:

| `type` | Formato no prompt |
|---|---|
| `dialogue` | `Balão de fala de {speaker}: "{text}"` |
| `offscreen` | `Balão de fala de {speaker}, vindo de fora do quadro: "{text}"` |
| `voice-over` | `Voz em off de {speaker}: "{text}"` |
| `caption` | `Legenda de narração: "{text}"` |
| `sfx` | `Onomatopeia: "{text}"` |
| `sign` | `Texto da placa: "{text}"` |
| `title` | `Título na imagem: "{text}"` |

Se `texts` estiver vazio: `"Nenhum texto essencial neste quadro."`

### Assets no Prompt

Os assets vinculados ao quadro (`refs` + assets dos `characters`) são **anexados como imagens** à chamada da API de geração, não incluídos como texto. O campo `characterDescription` do asset é incluído na seção "Personagens" do prompt.

---

## Page Assembly (Montagem de Pranchas)

A montagem de cada prancha é feita por um script Python (`backend/src/assembly/montagem.py`) invocado como processo filho. O script usa Pillow para composição de imagem.

### Parâmetros de Montagem

```
Canvas:      1800 × 2700 px (padrão), proporção 2:3
Fundo:       preto sólido (configurável)
Gutter:      48 px entre quadros (configurável)
Fit:         contain (padrão) — preserva quadro inteiro sem cortar
             cover — preenche slot, pode cortar bordas
```

### Layouts de Montagem

O script de montagem implementa cada template de forma determinística:

- **`rows-N`**: N faixas horizontais de altura igual, ocupando toda a largura do canvas.
- **`grid-CxR`**: grid regular de C colunas × R linhas, células iguais.
- **`top-then-grid-2x2`**: primeira faixa ocupa o terço superior; grid 2×2 ocupa os dois terços inferiores.

Para cada slot, o render selecionado é redimensionado para as dimensões do slot com o algoritmo `fit` escolhido. Se o render variar de proporção, `contain` garante que nenhum texto seja cortado.

### Processo de Montagem de Prancha

1. Para cada quadro na prancha (ordenado por `quadro.order`), obtém o render selecionado.
2. Se algum quadro não tiver render selecionado, retorna erro listando os quadros faltantes.
3. Compõe o canvas conforme o layout, posicionando cada render no slot correspondente.
4. Salva resultado em `data/projects/{id}/output/pranchas/{pranchaId}.png`.

### Processo de Montagem do Livro

1. Para cada prancha no projeto (ordenado por `prancha.number`), verifica que `output/pranchas/{pranchaId}.png` existe.
2. Se alguma prancha não tiver output, retorna erro listando as faltantes.
3. Gera os formatos solicitados:
   - **CBZ**: ZIP contendo os PNGs das pranchas em ordem numérica, nomeados `{number:03d}.png`.
   - **PDF**: img2pdf concatenando os PNGs sem recompressão de qualidade.
   - **EPUB**: EPUB3 de layout fixo (fixed-layout), uma página por `<spine>` item.
4. Armazena resultados em `data/projects/{id}/output/`.

---

## Frontend UI

### Layout

```
┌─────────────────────────────────────────────────────────────────────┐
│  ComicsGen   [Projeto: Fé Pública ▾]                    [Settings]  │
├─────────────────────────────────────────────────────────────────────┤
│                                                                       │
│  [Visão Geral] [Personagens] [Assets] [Pranchas] [Publicação]        │
│                                                                       │
└─────────────────────────────────────────────────────────────────────┘
```

### Aba Visão Geral

- Título do projeto (editável inline)
- Estilo global (textarea, editável)
- Restrições globais (lista editável)
- Seção de roteiro:
  - Botão de upload de roteiro markdown
  - Se roteiro existir: botão "Parsear com IA" → abre modal de revisão com `ParsedComicsScript`
  - Botão "Importar JSON estruturado" (import direto, pula IA)
  - Botão "Exportar ZIP do projeto"
- Seção de chave de API (input mascarado, mostra só se a chave está configurada)

### Aba Personagens

Cada personagem exibido como card:
- Nome e descrição canônica
- Asset de personagem: thumbnail + botões de upload/gerar
- Status: Ativo / Pendente

### Aba Assets

Tabela de todos os assets. Colunas: ID, Role, Status, Personagem (se aplicável), Arquivo (com link de download), Ações (editar, upload, deletar).

Filtros por role (character / style-reference / location).

### Aba Pranchas

A visão principal de produção.

**Lista de pranchas** (sidebar esquerda):
- Lista ordenada de pranchas com shortTitle e número
- Indicador de progresso (quantos quadros têm render selecionado)
- Botão "Nova prancha"

**Detalhe da prancha** (área principal, quando selecionada):
- Metadados da prancha (número, shortTitle, origin, layout)
- Grid visual dos quadros conforme o layout, cada um como card:

**Card de quadro**:
```
┌────────────────────────────────────────────────────────┐
│ Q3  ·  quadrado, 1:1  ·  [personagens: nivaldo]        │
│                                                          │
│ Composição: Plano médio. Nivaldo no banco...            │
│ Textos: [Balão Nivaldo] "Eu aguardo."                   │
│ Cenário: Cartório, banco de espera, madeira escura...   │
│                                                          │
│ Renders: [▶ r001] [▶ r002 ✓ selecionado] [+ Upload]    │
│                                                          │
│ [Gerar Render]  [Ver Prompt]  [Editar]  [Deletar]       │
└────────────────────────────────────────────────────────┘
```

O render selecionado é destacado. Clicar em um render mostra a imagem em tamanho maior. "Ver Prompt" exibe o prompt montado para copiar e usar em ferramentas externas.

### Aba Publicação

- **Montagem por prancha**: tabela de pranchas, cada uma com botão "Montar Prancha". Status: não montada / montada / desatualizada.
  - Opções de montagem: gutter, cor de fundo, fit (contain/cover), dimensões do canvas.
- **Publicação final**: botões "Gerar CBZ", "Gerar PDF", "Gerar EPUB", habilitados quando todas as pranchas estiverem montadas.
- Indicador de progresso para jobs em andamento (live via SSE).
- Botões de download para pranchas montadas e formatos finais.

---

## Project ZIP Format

```
{projectId}.zip
  project.json
  script.md              (se existir)
  pranchas/
    {pranchaId}.json
  assets/
    {assetId}.png
  renders/
    {pranchaId}/
      {quadroId}/
        {renderId}.png
  output/
    pranchas/
      {pranchaId}.png    (se montada)
    book.cbz             (se gerado)
    book.pdf             (se gerado)
    book.epub            (se gerado)
```

Import: upload do ZIP para `POST /projects/import`. O backend extrai, valida o `project.json` contra os tipos TypeScript correntes e recusa com erro listando incompatibilidades de tipo se o formato mudou.

---

## Docker

### Dockerfile

```dockerfile
FROM node:22-slim AS base
RUN apt-get update && apt-get install -y python3 python3-pip && rm -rf /var/lib/apt/lists/*
RUN pip3 install pillow img2pdf ebooklib

FROM base AS builder
WORKDIR /app
COPY package*.json ./
COPY packages/ packages/
RUN npm ci
COPY . .
RUN npm run build

FROM base AS runtime
WORKDIR /app
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/packages/types/dist ./packages/types/dist

ENV NODE_ENV=production
ENV PORT=3000
ENV DATA_DIR=/data

VOLUME ["/data"]
EXPOSE 3000

CMD ["node", "dist/server.js"]
```

### docker-compose.yml

```yaml
services:
  comicsgen:
    build: .
    ports:
      - "3000:3000"
    volumes:
      - ./data:/data
    environment:
      - NODE_ENV=production
      - PORT=3000
      - DATA_DIR=/data
```

---

## Repository Structure

```
comicsgen/
  packages/
    types/
      src/
        comics.ts          ← tipos TypeScript canônicos (formato completo)
      package.json
      tsconfig.json
  backend/
    src/
      server.ts
      routes/
        projects.ts
        scripts.ts
        characters.ts
        assets.ts
        pranchas.ts
        quadros.ts
        renders.ts
        assembly.ts
      services/
        project.ts
        prancha.ts         ← CRUD para pranchas e quadros
        render.ts          ← gestão de renders
        ai.ts              ← integração OpenRouter (parse + geração)
        prompt.ts          ← montagem de prompts de quadro
        assembly.ts        ← orquestração de montagem
      assembly/
        montagem.py        ← script Python de composição de imagem (Pillow)
        montagem.ts        ← wrapper Node.js para invocar montagem.py
        book.ts            ← geração CBZ / PDF / EPUB
        probe.ts           ← inspecionar dimensões de PNG
      storage/
        filesystem.ts
      jobs/
        queue.ts
    package.json
    tsconfig.json
  frontend/
    src/
      main.tsx
      App.tsx
      pages/
        Overview.tsx
        Characters.tsx
        Assets.tsx
        Pranchas.tsx
        Publication.tsx
      components/
        QuadroCard.tsx
        RenderViewer.tsx
        AssetCard.tsx
        CharacterCard.tsx
        ScriptImportModal.tsx
        PromptPreviewModal.tsx
        AssemblyProgress.tsx
        PranchaGrid.tsx    ← renderiza o grid visual da prancha conforme o layout
      api/
        client.ts
      hooks/
        useProject.ts
        usePrancha.ts
        useAssembly.ts
    package.json
    tsconfig.json
    vite.config.ts
  Dockerfile
  docker-compose.yml
  package.json
  tsconfig.base.json
```

---

## Key Constraints and Non-Goals (v1)

- **Sem contas de usuário.** Single-user, deploy local.
- **Sem armazenamento em nuvem.** Todos os dados no filesystem do host montado no Docker.
- **Sem geração via API de imagem externa.** O app prepara o prompt, chama `codex image_gen` localmente e gerencia os renders. Integração direta com APIs de imagem (Replicate, fal.ai, etc.) está fora do escopo v1.
- **Sem lettering programático.** Balões e legendas são instruídos ao modelo de imagem dentro do prompt. O app não faz pós-processamento de texto sobre as imagens geradas.
- **Sem colaboração em tempo real.** Um usuário, uma sessão.
- **Sem versionamento de formato.** Mudanças de formato quebram projetos antigos por design.
- **Sem undo/redo.** O export ZIP é o mecanismo de backup.
- **Dupla de pranchas (splash duplo).** Quando duas pranchas do roteiro formam uma única imagem de página dupla, são tratadas como uma `Prancha` com layout `rows-1` numerada com o primeiro número. O segundo número fica sem arquivo (gap intencional). O campo `origin` registra ambos os números: `"roteiro/ato_um.md · PRANCHA 62-63 (dupla)"`.
