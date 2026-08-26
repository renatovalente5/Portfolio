# Portefólio — Renato Valente

Página única com os sites feitos para empresas portuguesas. Alojada no GitHub Pages,
100 % estática, sem dependências de runtime.

**No ar:** https://renatovalente5.github.io/Portfolio/

---

## O que é

Uma montra, não um argumento. O que a página tem é: dezoito capturas reais, um mapa
que diz onde ficam, e um número de telefone. **533 palavras no total**, e quase todas
são dados — nomes de clientes, endereços, actividades e localidades. De prosa há duas
frases.

`index.html` **é gerado** — nunca se edita à mão. Tudo o que aparece (contagens,
chips, mapa, ordem dos trabalhos) sai de `data/*.json` através de `_source/build.mjs`.

- **Mapa administrativo verdadeiro.** 278 concelhos do continente, fronteiras da Carta
  Administrativa Oficial de Portugal (via `json.geoapi.pt`), projectados no build. Os
  12 concelhos com trabalho aparecem pintados com a cor da marca do cliente — e, onde
  há mais do que um trabalho no mesmo concelho, em faixas com as cores verdadeiras de
  todos. Não é filtro nem pesquisa: é um desenho que acompanha a leitura (o concelho
  do cartão que está a meio do ecrã ganha contorno) e desbota o que sai do filtro.
- **Quarentena da cor.** A página não tem cor própria. A única cor da interface é
  `--sinal`. Toda a outra cor pertence a um cliente e vive em três sítios de área
  mínima: o filete de 3 px do cartão, a banda da fita e o concelho no mapa.
- **Capturas reais.** Cada cartão mostra o site em desktop e em telemóvel, dentro de
  uma moldura de browser com o **endereço verdadeiro** — para o visitante ir verificar.
- **«Em desenvolvimento».** Os sites que ainda estão em `renatovalente5.github.io/…`
  em vez do domínio final do cliente levam a etiqueta dentro da barra de endereço da
  moldura, ao lado do endereço. É uma coisa sobre o endereço, não sobre o trabalho.
  Deriva de `em_desenvolvimento` em `data/trabalhos.json`.
- **Nada escrito à mão.** O gerador tem uma auditoria com travões: se as contagens por
  sector não somarem, se uma cor de marca não der 4,5:1 contra o fundo, se um contacto
  no HTML não vier de `data/autor.json`, se as capturas tiverem mais de 120 dias, ou se
  um número por extenso contradisser o número real de trabalhos, o build falha.

O telefone aparece em quatro sítios (cabeça fixa, herói, contacto, rodapé) e na barra
fixa do telemóvel — e sai **sempre** de `data/autor.json`, nunca escrito à mão.

---

## Estrutura

```
data/
  trabalhos.json      ← a fonte de verdade dos trabalhos
  autor.json          ← nome e contactos (nif/morada ficam a null por decisão)
_source/
  build.mjs           ← o gerador (só node:fs / node:path)
  cor.mjs             ← sRGB ↔ OKLab/OKLCh, contraste WCAG, famílias de matiz
  dados/              ← entradas do build: mapa, capturas, logótipos, concelhos
  pipeline/           ← ver abaixo
assets/
  portfolio.css  portfolio.js  mapa.svg  favicon.svg
  fontes/        ← Schibsted Grotesk + IBM Plex Mono, subconjunto latino, auto-alojadas
  capturas/      ← 18 × (3 larguras desktop + 1 telemóvel), webp
  logos/         ← 18 logótipos originais dos clientes, redimensionados
index.html            ← GERADO. Não editar.
```

## Correr

```bash
node _source/build.mjs
```

Servir localmente:

```bash
python3 -m http.server 4319
```

## Verificar antes de publicar

```bash
node _source/pipeline/5-verificar.mjs
```

Abre o Chrome (separador em primeiro plano — num separador oculto o `rAF` não corre e
a captura mente), renderiza a página inteira a 375/900/1440 px em claro e escuro,
grava as imagens em `_source/tmp/ver/`, e falha se houver overflow horizontal,
elementos fora do ecrã, alvos com menos de 24 px, imagens sem `width`/`height`, erros
na consola, ou **bandas de 400 px sem nada pintado** — esta última existe porque as
fichas têm `content-visibility:auto` e uma captura da página inteira já saiu em branco
a partir da grelha enquanto o script dizia «sem problemas detectados».

## Pipeline (só quando os dados de origem mudam)

Por ordem. Precisa de Chrome, `python3` com Pillow, `cwebp` e ligação à internet.

```bash
_source/pipeline/0-municipios.sh          # geometrias dos 308 municípios (CAOP)
python3 _source/pipeline/4-geo.py         # -> _source/dados/{concelhos,mapa-continente}.json
node    _source/pipeline/1-capturar.mjs   # capturas dos 18 sites (desktop + telemóvel)
python3 _source/pipeline/2-capturas.py    # -> assets/capturas/*.webp
python3 _source/pipeline/3-logos.py       # -> assets/logos/*.webp + a cor de cada placa
node    _source/build.mjs
```

`1-capturar.mjs` fecha sozinho os avisos de cookies (preferindo *rejeitar*) e, para
sites multilingues, força o português antes de disparar — ver a constante `PREP`.

`3-logos.py` **não redesenha nem recolore** a arte do cliente. Escolhe a variante do
logótipo e resolve a cor da placa (tinta quase-preta ou branco) medindo, pixel a pixel,
qual das duas perde menos arte e mantém o quartil inferior de contraste acima de 2,6:1;
a logótipos de traço fino dá mais altura.

## Acrescentar um trabalho

1. Juntar a entrada a `data/trabalhos.json` (o `concelho` tem de existir na lista dos
   308 e a `lat`/`lon` tem de ser o centróide desse concelho — o build verifica).
2. `node _source/pipeline/1-capturar.mjs <id>` e acrescentar o `id` à lista `SITES`.
3. `python3 _source/pipeline/2-capturas.py && python3 _source/pipeline/3-logos.py`
4. `node _source/build.mjs`

Nenhuma contagem precisa de ser tocada: são todas recalculadas.

## Quando um site passar para o domínio final

Em `data/trabalhos.json`, pôr `dominio_proprio: true`, `em_desenvolvimento: false`, e
actualizar `endereco` e `url`. Voltar a capturar esse site e correr o build: a etiqueta
desaparece sozinha e o endereço novo aparece na moldura.

---

## O Compasso (removido)

A primeira versão tinha um campo onde o visitante escrevia o concelho dele e a página
media a distância a cada trabalho, reordenava os cartões do mais perto para o mais
longe e desenhava arcos de 50 e 100 km no mapa. Saiu a pedido — o mapa passou a ser só
um desenho, sem pesquisa nem filtro.

Está guardado no commit `b8a92e3`. Para o ver:

```bash
git show b8a92e3:assets/portfolio.js
```
