# Portefólio — Renato Valente

Página única com os sites feitos para empresas portuguesas. Alojada no GitHub Pages,
100 % estática, sem dependências de runtime.

**No ar:** https://renatovalente5.github.io/Portfolio/

---

## O que é

Uma montra, não um argumento. O que a página tem é: dezoito capturas reais, um mapa
que diz onde ficam, e um número de telefone. **520 palavras no total**, e quase todas
são dados — nomes de clientes, endereços, actividades e localidades. De prosa há duas
frases.

`index.html` **é gerado** — nunca se edita à mão. Tudo o que aparece (contagens,
chips, mapa, ordem dos trabalhos) sai de `data/*.json` através de `_source/build.mjs`.

- **Mapa administrativo verdadeiro.** 278 concelhos do continente, fronteiras da Carta
  Administrativa Oficial de Portugal (via `json.geoapi.pt`), projectados no build. Os
  12 concelhos com trabalho aparecem pintados com a cor da marca do cliente — e, onde
  há mais do que um trabalho no mesmo concelho, em faixas com as cores verdadeiras de
  todos. **O mapa nunca é filtrado** pelos chips de sector: é geografia, não é o estado
  do filtro. Ao ponteiro, ganha o concelho cujo centróide está mais perto do cursor — e
  não se testa se o ponto cai dentro de uma forma: no aglomerado de Aveiro o polígono do
  vizinho grande envolve a mancha pequena, e apontar a São João da Madeira (5×6 px de
  ecrã) devolveria Oliveira de Azeméis.
- **Passar o rato pelo mapa abre um painel** com os sites daquele concelho — não vai
  direito a nenhum deles. O clique prende-o (para não fugir quando o rato sai) e no
  telemóvel o toque abre-o. O fecho é tolerante: quem vai do mapa para o painel
  atravessa um vão de 16 px, e um fecho imediato tirava-lhe o painel debaixo do cursor. O painel fica **ao lado** do mapa acima de 900 px e **por baixo** dele em
  ecrãs estreitos: ancorado no centróide, o de Santa Maria da Feira (cinco sites, 337 px
  de altura) tapava Leiria e Lisboa.
- **Um comportamento, dois gatilhos.** O alvo do rato e do dedo é a caixa do mapa toda;
  o gatilho de teclado é o **nome do concelho**, que é um `<button>` de 45 px com
  `aria-expanded`. As manchas do SVG são decoração (`aria-hidden`, sem `tabindex`):
  torná-las focáveis dava alvos de 5×6 px e doze paradas de tabulação para o mesmo sítio.
- **Traço com `paint-order: stroke fill`.** O traço é auréola exterior e não come a
  mancha: São João da Madeira passa de 3,9×5,0 px para 5,0×6,1 px, legível **sem gesto
  nenhum** — que é o único ganho que conta no telemóvel.
- **Quarentena da cor.** A página não tem cor própria. A única cor da interface é
  `--sinal`. Toda a outra cor pertence a um cliente e vive em quatro sítios de área
  mínima: o filete de 3 px do cartão, a banda da fita, o concelho no mapa e o risco
  sob o nome do concelho quando está aceso.
- **Capturas reais.** Cada cartão mostra o site em desktop e em telemóvel, dentro de
  uma moldura de browser com o **endereço verdadeiro** — para o visitante ir verificar.
- **«Em desenvolvimento».** Os sites que ainda estão em `renatovalente5.github.io/…`
  em vez do domínio final do cliente levam a etiqueta dentro da barra de endereço da
  moldura, ao lado do endereço. É uma coisa sobre o endereço, não sobre o trabalho.
  Deriva de `em_desenvolvimento` em `data/trabalhos.json`.
- **Botão de subir** no canto inferior direito, que aparece depois de o herói sair do
  ecrã. Sem ouvir o `scroll`: um `IntersectionObserver` sobre o herói, que já existe —
  e nunca um sentinela em `vh`, que cresce quando alguém estica o ecrã.
- **Nada escrito à mão.** O gerador tem uma auditoria com travões: se as contagens por
  sector não somarem, se uma cor de marca não der 4,5:1 contra o fundo, se um contacto
  no HTML não vier de `data/autor.json`, se as capturas tiverem mais de 120 dias, ou se
  um número por extenso contradisser o número real de trabalhos, o build falha.

O telefone aparece em quatro sítios (cabeça fixa, herói, contacto, rodapé) e na barra
fixa do telemóvel, ao lado do WhatsApp — e sai **sempre** de `data/autor.json`, nunca
escrito à mão. O botão da cabeça fixa vai para o **WhatsApp**, e diz-o: «WhatsApp
925 110 570». Na secção de contacto o número aparece em tamanho grande e é ele próprio
a ligação `tel:` — em corpo grande não precisa de uma palavra a dizer o que é.

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

## Backoffice — esconder e mostrar trabalhos

O botão que interessa é o **«Mostrar na página»** de cada trabalho. Ao desligá-lo, o
trabalho sai da grelha **e todos os números se recalculam sozinhos**: os contadores do
topo, as contagens dos chips de sector, os concelhos do mapa e a lista de nomes. Nada
na página é escrito à mão, por isso não há nada para ir corrigir.

É o [Pages CMS](https://pagescms.org) (grátis, MIT, sem cartão), configurado em
`.pages.yml`. Duas colecções: **Trabalhos** (`data/trabalhos.json`) e **Os meus
contactos** (`data/autor.json`).

**Activar, uma vez só:**
1. Ir a [app.pagescms.org](https://app.pagescms.org) e entrar com o GitHub.
2. Instalar a app do Pages CMS neste repositório (`renatovalente5/Portfolio`).
3. Abrir o projecto — as duas colecções aparecem sozinhas, a partir do `.pages.yml`.

Para dar acesso a outra pessoa sem conta de GitHub: convidar por email no painel do
Pages CMS; entra por link mágico.

**O que acontece ao gravar:** o CMS faz commit em `main` → o GitHub Actions corre
`node _source/build.mjs`, escreve o `index.html` de volta ao repositório e publica.
Demora 1 a 3 minutos. Se os dados ficarem inválidos (uma contagem que não soma, um
concelho que não existe na CAOP, uma cor de marca sem 4,5:1), **o build falha e nada é
publicado** — a página no ar continua a última que estava boa.

**Duas armadilhas do Pages CMS, já resolvidas aqui:**
- O CMS **apaga as chaves que não conhece** ao gravar. Por isso o `.pages.yml` declara
  *todos* os campos que existem nos dados, mesmo os que já não aparecem na página
  (`resumo`, `destaque`, `destaque_largo`, `nif`, `morada`). Ao acrescentar um campo aos
  dados, acrescentá-lo também ao `.pages.yml`.
- Como o CMS faz commit em `main`, antes de empurrar alterações locais correr sempre:

```bash
git fetch && git rebase origin/main
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

## Bateria de testes

```bash
node _source/pipeline/6-testar.mjs
U=https://renatovalente5.github.io/Portfolio/ node _source/pipeline/6-testar.mjs
```

54 afirmações verificadas num browser a sério, com rato, dedo e teclado: contagens que
têm de bater umas com as outras, o filtro por sector (e que o **mapa não é filtrado**),
os três modos da fita a 1440/800/375 px, apontar ±3 px em doze concelhos, o painel a
abrir no hover e a sobreviver ao rato entrar nele, o clique a prendê-lo, o Escape a
fechá-lo, zero paradas de tabulação no mapa, zero alvos abaixo de 24 px, o botão de
subir, as ligações dos cartões, e nenhum erro na consola. Sai com código 1 se alguma
falhar.

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

`3-logos.py` **não redesenha nem recolore** a arte do cliente. A placa é **branca**, e
o script procura, entre todas as variantes do logótipo, a que melhor se lê em branco —
mede pixel a pixel. Só quando nenhuma sobrevive é que admite a placa em tinta escura, e
isso acontece em dois dos dezoito, precisamente os que têm a arte literalmente branca
(Gold Cleaning tem as letras a branco; o Feira Norte Auto é todo lima #AEFE05).
Reconhece também fundos opacos: um PNG sem transparência é um logótipo sobre um fundo
sólido, lido nos quatro cantos, e esses pixéis não contam como arte perdida. A logótipos
de traço fino dá mais altura.

## Acrescentar um trabalho

1. Juntar a entrada a `data/trabalhos.json` (o `concelho` tem de existir na lista dos
   308 e a `lat`/`lon` tem de ser o centróide desse concelho — o build verifica).
2. `node _source/pipeline/1-capturar.mjs <id>` e acrescentar o `id` à lista `SITES`.
3. `python3 _source/pipeline/2-capturas.py && python3 _source/pipeline/3-logos.py`
4. `node _source/build.mjs`

Nenhuma contagem precisa de ser tocada: são todas recalculadas.

## O botão de gestão

No rodapé há uma ligação discreta, **Gestão**, para `app.pagescms.org`. É só um atalho:
quem não estiver autenticado e sem a app instalada no repositório não vê nada.

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

## Duas armadilhas do mapa, para não voltarem

**Uma declaração `fill` no CSS atropela sempre o atributo `fill="url(#gradiente)"`.**
Os dois concelhos com vários trabalhos (Ovar e Santa Maria da Feira) pintam-se com um
gradiente de faixas; quando o CSS declarava `fill:var(--m,…)` e o atributo trazia o
`url()`, o CSS ganhava, o `var(--m)` não existia, e o `fill:inherit` de socorro herdava
o **preto por omissão do SVG**. O gradiente passa pela própria custom property
(`style="--m:url(#g-ovar)"`), e `fill:var(--m)` serve os dois casos sem excepção.

**Um traço escuro num concelho pequeno não é destaque, é uma mancha preta.** O estado
activo usava `stroke:var(--tinta);stroke-width:2.2` com o traço centrado: em São João
da Madeira (5,7 unidades de largura) o contorno comia a mancha toda. Agora o traço é
exterior (`paint-order`) e o destaque é geometria — a forma cresce.
