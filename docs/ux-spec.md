# MediaGen — Especificação de UX/UI

## Filosofia de produto

O app é um **assistente de produção**, não um formulário. A qualquer momento ele sabe em que etapa o projeto está e apresenta a ação mais relevante. O usuário não navega por abas arbitrárias — ele avança por um pipeline que reflete o estado real do trabalho.

Três princípios norteadores:

- **Pipeline sobre navegação** — a estrutura de telas segue a sequência natural de produção, não uma taxonomia de entidades (personagens, assets, cenas).
- **Geração incremental** — produz um item de cada vez, com revisão imediata, sem gastar crédito antes de perceber um erro.
- **Versionado por padrão** — cada projeto é um repositório git. Toda alteração significativa é um commit automático. Rollback é `git checkout`.

---

## Estrutura de informação

```
Home
└── Projeto
    ├── Pipeline (dashboard)
    ├── Roteiro
    ├── Produção          ← tela central
    │   ├── Personagens
    │   ├── Cenários / Locais
    │   └── Shots (filme) / Pranchas (HQ)
    └── Publicação / Montagem
```

---

## Telas

### 1. Home — Lista de projetos

Lista única de todos os projetos (filmes e HQs), ordenada por data de edição. Cada item mostra:

- Título
- Badge de tipo (Filme / HQ)
- Barra de progresso do pipeline (ex: "Produção — 8/34 shots")
- Data da última edição

Botão "Novo projeto" → diálogo com escolha de tipo → título → cria e abre.

Nenhum outro seletor ou toggle de tipo na navegação principal.

---

### 2. Dashboard do projeto — Pipeline

Substitui completamente o sistema de abas. Um painel vertical com as etapas em sequência:

```
● Roteiro            "roteiro.md · 3 cenas"              [ver]
● Parse              "concluído · 12 personagens"         [ver]
◐ Personagens        "4 / 12 gerados"                    [continuar →]
○ Cenários           "0 / 5"
○ Shots              "0 / 34"
○ Montagem           —
```

Ícones: `●` feito, `◐` em progresso, `○` bloqueado ou não iniciado.

Clicar em qualquer etapa abre a tela correspondente. A etapa "em progresso" mais recente fica expandida por padrão, mostrando um preview do item atual e um botão de ação.

Não existe aba de "Visão Geral" — o pipeline É a visão geral.

---

### 3. Roteiro

- Visualização do script em markdown (leitura, com syntax highlight de sluglines).
- Barra lateral direita: histórico git — cada entrada mostra data, descrição automática ("Parse aplicado · 12 personagens"), botão de restaurar.
- Botão "Parsear com IA" → roda em background, aplica automaticamente ao terminar, commita como `parse: ${timestamp}`. **Nenhum popup de revisão** — o git é o mecanismo de revisão.
- Botão "Carregar novo roteiro" → substitui o arquivo e commita como `roteiro: atualizado`.
- Se o parse estiver rodando, uma barra de progresso discreta aparece no topo da tela; o usuário pode navegar livremente.

---

### 4. Tela de Produção — o coração do app

É a mesma tela para personagens, cenários e shots, parametrizada pelo tipo de item. Dois modos: **Manual** e **API**.

#### Layout geral

```
┌─────────────────────────────────────────────────────────────┐
│ ← Pipeline   Personagens — "Dr. Euclides (3/12)"   [⏸ API] │
├──────────────────────────┬──────────────────────────────────┤
│                          │                                  │
│  PROMPT                  │  RESULTADO                       │
│  ───────                 │  ────────                        │
│  Gênero: Masculino       │                                  │
│  Idade: 60s              │   ┌──────────────────────┐       │
│  Etnia: …                │   │                      │       │
│  …                       │   │   [arraste / cole    │       │
│  (self-contained,        │   │    uma imagem aqui]  │       │
│   copy-paste ready)      │   │                      │       │
│                          │   └──────────────────────┘       │
│  [📋 Copiar prompt]      │                                  │
│                          │  HISTÓRICO                       │
│  ─────────────────────   │  ────────                        │
│  [⚡ Gerar com API →]    │  [👤] João ✓                     │
│                          │  [👤] Marta ✓                    │
│                          │  [👤] …                          │
└──────────────────────────┴──────────────────────────────────┘
```

**Modo Manual:**

- O painel esquerdo mostra o prompt do próximo item a gerar, completo e auto-contido (pode ser colado direto no ChatGPT, Midjourney, etc.).
- O painel direito é uma zona de drop/paste. Ao receber uma imagem:
  - Salva imediatamente o asset associado ao item.
  - Commita no git: `asset: personagem/euclides · aparência`.
  - Avança automaticamente para o próximo item na fila.
  - O thumbnail do item recém-gerado vai para a coluna de histórico.
- Clicar num thumbnail do histórico abre um painel de revisão lateral (não sai da tela) com opção de substituir.
- A fila pula itens já gerados; o usuário pode reordenar ou pular.

**Modo API:**

- Botão "Gerar com API →" abre um painel de controle no lugar do histórico:
  ```
  ● Gerando: Dr. Euclides — aparência
  ─────────────────────────────────────
  Rate limit: 1 por minuto     [ajustar]
  Próximo em: 0:43
  ─────────────────────────────────────
  [■ Parar geração]
  ```
- Cada item gerado aparece na zona de resultado, fica visível por 3s, depois avança para o próximo — exatamente como se o usuário tivesse colado manualmente.
- O botão de parar é grande e vermelho. Ao parar, o modo volta para Manual no item atual.
- Rate limit configurável (padrão: 1/min). O objetivo é dar tempo para o usuário perceber um erro antes de gerar dezenas de itens errados.

**Fila e ordenação:**

O app decide a ordem por relevância: personagens principais primeiro (mais referenciados nas cenas), depois secundários, depois figurantes. O usuário pode reordenar arrastando.

---

### 5. Shots (filme) / Pranchas e Quadros (HQ)

A mesma lógica de produção, mas o item é um shot de vídeo (filme) ou um quadro (HQ).

Para **shots de vídeo**: a zona de drop aceita upload de arquivo de vídeo (não paste, pois vídeo não é copiável no browser). O prompt descreve a cena completa: câmera, ação, personagens presentes, estilo visual. Uma miniatura do frame inicial aparece no histórico.

Para **quadros de HQ**: a zona de drop aceita paste de imagem. O prompt inclui layout da prancha, composição do quadro, personagens, textos de diálogo (separados do prompt de imagem para não poluir).

O histórico de shots/quadros pode ser visualizado como uma "fita" horizontal na parte inferior, clicável.

---

### 6. Montagem / Publicação

**Filme:** lista de cenas com os shots em ordem, player integrado para preview, botão "Montar vídeo" que roda ffmpeg no backend.

**HQ:** preview de pranchas em sequência, exportação como PDF ou ebook. A exportação usa Nickel como formato de arquivo intermediário, nunca JSON.

---

### 7. Configurações (painel global)

Acessível pelo ícone de engrenagem em qualquer tela:

- Chave OpenRouter (mascarada, editável)
- Modelo de parse
- Modelo de TTS
- Rate limit padrão para geração automática
- Diretório de dados (exibido, não editável aqui — edita no `.env`)

---

## Versionamento

Cada projeto mantém um repositório git na pasta de dados (`data/films/projects/{id}/`). O app faz commits automáticos nos eventos:

| Evento | Mensagem de commit |
|---|---|
| Parse aplicado | `parse: ${n} cenas, ${m} personagens` |
| Asset salvo | `asset: ${tipo}/${id}` |
| Campo editado | `edit: ${campo}` |
| Shot/quadro adicionado | `shot: cena ${n} · shot ${m}` |

A tela de Roteiro expõe o log git como histórico navegável. Em qualquer outra tela, o histórico é acessível por um ícone de relógio no canto.

---

## Formatos de arquivo

- **Em disco:** Nickel (`.ncl`) para estrutura, markdown para roteiro, arquivos de mídia nativos.
- **Exportação/importação:** arquivo `.ncl` ou bundle de pasta — nunca JSON.
- **JSON** não aparece em nenhuma interface visível ao usuário. É um detalhe interno de comunicação backend↔API e nada mais.

---

## O que sumir

- Toggle Films/Comics no header ✓ (já feito)
- Popup de revisão de parse antes de salvar
- "Importar JSON estruturado"
- Abas genéricas (Overview, Characters, Assets, Scenes, Assembly) como navegação primária
- API key por projeto ✓ (já feito)
