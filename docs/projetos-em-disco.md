# Projetos em disco — editar pelo Claude Code e transportar local↔VPS

O MediaGen guarda cada projeto como arquivos no disco (formato Nickel, `.ncl`).
A aplicação web **lê do disco a cada requisição, sem cache** — então qualquer
edição feita direto nos arquivos (por você, por um script, ou por um Claude Code
rodando no terminal) é reconhecida na hora: basta recarregar a tela.

## Onde ficam

Raiz: `DATA_DIR` (variável de ambiente; padrão `./data`).

```
$DATA_DIR/
  films/projects/<id>/        # projetos de filme
    project.ncl               # metadados, assets (personagens/vozes), índice de cenas
    script.md                 # roteiro bruto (markdown)
    scenes/<scene>.ncl        # uma cena por arquivo (shots, falas, refs)
    outline.ncl               # beat sheet da co-criação (logline, temas, atos→beats)
    cocreate-chat.ncl         # transcrição do chat de co-criação
    parsed-script.ncl         # resultado de parse ainda não aplicado (se houver)
    assets/  takes/  output/  # MÍDIA gerada (imagens, áudios, vídeos)
  comics/projects/<id>/       # projetos de HQ
    project.ncl
    script.md
    pranchas/<prancha>.ncl    # uma prancha por arquivo (quadros, textos, refs)
    parsed-script.ncl
    assets/  renders/  output/ # MÍDIA gerada
```

Cada pasta de projeto é também um **repositório git** — a tela "Histórico"
mostra e restaura versões. Edições manuais entram na próxima ação que comita.

## O formato é o código

A definição canônica dos tipos é o pacote `@mediagen/types`:

- Filme: `packages/types/src/index.ts` (`Project`, `Scene`, `Shot`, `Outline`, …)
- HQ: `packages/types/src/comics.ts` (`ComicsProject`, `Prancha`, `Quadro`, …)

O serializador Nickel (`backend/src/storage/nickel.ts`) ordena as chaves
alfabeticamente; fora isso é um JSON-como-Nickel direto. Ao editar à mão, mantenha
os campos coerentes com esses tipos — o backend valida ao importar e ao aplicar.

## Fluxo recomendado (Claude Code → web → VPS)

1. **Local**: crie o projeto (na web ou direto no disco) e deixe o Claude Code
   trabalhar nos arquivos `.ncl`. A web local — apontando o mesmo `DATA_DIR` —
   reconhece o trabalho ao recarregar.
2. **Exportar estrutura**: na tela do projeto, "Exportar estrutura (.ncl)" gera um
   zip leve, só com os arquivos de estrutura (sem mídia) — ideal para transportar.
3. **Enviar para a VPS** e **Importar**: na tela inicial, "Importar" aceita o zip
   (inclusive de um projeto ainda inacabado) e cria o projeto no servidor.
4. **Gerar mídia pela web** na VPS, a partir da estrutura importada.

Para levar também a mídia já gerada, use "Exportar com mídia" em vez de estrutura.
