# Pipeline de produção em etapas

MediaGen separa a fonte narrativa da estrutura de produção. A fonte crua é
barata, fiel e reextraível; a transformação criativa é incremental, por cena, e
gera candidatos revisáveis.

## DAG

```text
script.md
  -> cenas cruas (scenes-raw/<n>.ncl)
  -> assets de referência (personagens + lugares)
  -> transform por cena
      filme: cena crua -> Scene -> Shot[]
      HQ: cena crua -> Prancha[] local -> Quadro[]
  -> mídia por unidade
      filme: Shot -> Take[]
      HQ panels: Quadro -> Render[]
      HQ page: Prancha -> PageRender[]
  -> montagem
      filme: cenas -> filme
      HQ panels: renders + lettering programático -> página final
      HQ page: page render selecionado -> página final
  -> publicação/export
```

## Invariantes

- `scenes-raw/` é fonte. Transformações nunca alteram a prosa original.
- Estruturas de produção são derivadas e podem ser regeneradas por cena.
- Candidatos são acumulados; selecionar um candidato é uma ação separada.
- Re-transform preserva mídia dos itens mantidos por ordem: takes no filme,
  renders de quadros na HQ e renders de página na prancha.
- A UI deve dar feedback visual em até 100ms para qualquer ação; chamadas
  externas continuam assíncronas por job/SSE ou spinner local.

## Decisões

- Filme usa `Scene.number` como ordem narrativa e `Shot.order` dentro da cena.
- HQ não trata número de página como fonte criativa. `Prancha.number` é um índice
  derivado para exibição/montagem, recalculado após aplicar transformações de
  cena. A fonte narrativa da HQ é a cena crua; a paginação nasce da transformação
  ou da montagem.
- O modo padrão de HQ é `panels`: cada quadro gera sua imagem e a página final é
  montada programaticamente.
- O modo `page` é opt-in por prancha: a prancha inteira recebe candidatos de
  imagem e a montagem final usa o candidato selecionado.
- Lettering programático é usado no modo `panels`, desenhando balões, legendas,
  placas/títulos e SFX a partir de `QuadroText`. No modo `page`, o texto continua
  embutido na geração da página inteira.
