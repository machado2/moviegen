---
id: TASK-38
title: >-
  Pipeline de produção em etapas (extração → cena crua → transform por cena →
  render)
status: To Do
assignee: []
created_date: '2026-06-27 23:47'
labels:
  - pipeline
  - architecture
  - design
  - backend
dependencies: []
priority: medium
ordinal: 47000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Repensar o parse/geração para deixar de ser uma única passada agêntica que cospe a estrutura inteira (personagens + cenas já explodidas em shots/quadros) e virar um pipeline em etapas, por unidade e sob demanda, alinhado à filosofia do Estúdio.

DESENHO (medium-agnóstico):
roteiro (script.md)
  → [Extração] cenas CRUAS {nº, cabeçalho, prosa original, quem aparece} + elenco {nome, descrição} + LUGARES {nome, descrição}
  → [Assets de referência] imagens de personagem/lugar (por entidade, sob demanda)
  → [Transformação POR CENA] shots (filme) / quadros+layout (HQ) — etapa criativa cara, incremental e revisável
  → [Mídia] takes de vídeo / renders de imagem (por unidade, sob demanda)

POR QUE: separa duas responsabilidades hoje grudadas numa LLM call só — extração fiel (barata, quase mecânica, re-rodável) vs transformação criativa (cara, por cena). Ganhos: incremental/revisável cena a cena, custo sob controle (casa com teto+estimativa já feitos), re-transform barato com a prosa crua guardada, modelos diferentes por etapa.

ESTADO HOJE (para referência): parse é 1 passada agêntica (backend/src/services/parseAgent.ts e comics/services/parseAgent.ts); intermediário persistido é parsed-script.ncl já transformado; a prosa original da cena NÃO é guardada em lugar nenhum; lugares NÃO são extraídos (só add_character); filme tem 3 níveis (cena→shot), HQ tem 2 (prancha→quadro) e funde layout no parse.

DECISÕES EM ABERTO (resolver ao detalhar as subtarefas): (1) cena crua como campo na Scene/Prancha ou camada própria (scenes-raw/) com ponteiro de procedência — preferência: camada própria; (2) HQ ganha de fato o nível de cena (com numeração global de páginas) ou fica em 2 níveis; (3) onde mora o gatilho 'transformar esta cena' e se ele gera candidatos de breakdown.

Esta é a tarefa-mãe; as subtarefas implementam em fatias finas (filme primeiro, depois a analogia HQ).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Desenho registrado em docs/ (ex.: docs/pipeline.md ou seção em docs/ARCHITECTURE.md) com o DAG de etapas e o invariante por unidade
- [ ] #2 As 3 decisões em aberto resolvidas e refletidas nas subtarefas
- [ ] #3 Subtarefas criadas cobrindo: extração+cena crua, lugares, transform por cena (filme), nível de cena + transform (HQ), modo de render de HQ, lettering
<!-- AC:END -->
