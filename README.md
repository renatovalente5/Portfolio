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
  atravessa um vão de 16 px, e um fecho imediato tirava-lhe o painel debaixo do cursor.
- **O painel abre sobre o mapa, junto à mancha**, em qualquer largura. São 36 posições
  candidatas — quatro lados, cada um deslizado de −100 % a +100 % ao longo do painel —
  todas presas ao ecrã e pontuadas: sentar-se na mancha em que se carregou está fora
  de questão, tapar um vizinho assinalado custa 120 px de afastamento, e a seguir ganha
  quem estiver mais perto. O **lado sai da posição final**, não da candidata: depois de
  prender ao ecrã, uma candidata «cima» pode acabar à direita da mancha, e o bico
  apontava para o lado errado. Medido nos doze concelhos a seis larguras, de 390 px a
  1920 px: nenhum sai do ecrã, nenhum tapa outra mancha, nenhum tapa a sua.
- **Tocar fora fecha.** «Fora» é para além de 120 unidades do mapa (≈ 70 km) de
  qualquer mancha — tocar no Alentejo não abre o painel de Lisboa.
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
- **«Em desenvolvimento», com dois sinais.** Os sites que ainda estão em
  `renatovalente5.github.io/…` em vez do domínio final do cliente levam (a) a etiqueta
  na barra de endereço da moldura, em tinta cheia sobre papel, e (b) o **filete do
  cartão tracejado**. O segundo é o que permite ver *quais* de relance, sem ler nada —
  a etiqueta sozinha, a 0,625 rem, passava despercebida. Sem cor nova: a paleta
  continua fechada. Deriva de `em_desenvolvimento` em `data/trabalhos.json`.
- **Botão de subir** no canto inferior direito, que aparece depois de o herói sair do
  ecrã. Sem ouvir o `scroll`: um `IntersectionObserver` sobre o herói, que já existe —
  e nunca um sentinela em `vh`, que cresce quando alguém estica o ecrã.
- **Nada escrito à mão.** O gerador tem uma auditoria com travões: se as contagens por
  sector não somarem, se uma cor de marca não der 4,5:1 contra o fundo, se um contacto
  no HTML não vier de `data/autor.json`, se as capturas tiverem mais de 120 dias, ou se
  um número por extenso contradisser o número real de trabalhos, o build falha.

O telefone aparece em quatro sítios (cabeça fixa, herói, contacto, rodapé) e sai
**sempre** de `data/autor.json`, nunca escrito à mão. No telemóvel a cabeça fixa não
mostra o número — ele está no herói, na secção de contacto e no rodapé; **não há barra
fixa** por cima da página. O botão da cabeça fixa vai para o **WhatsApp**, e diz-o: «WhatsApp
925 110 570». Na secção de contacto o número aparece em tamanho grande e é ele próprio
a ligação `tel:` — em corpo grande não precisa de uma palavra a dizer o que é.

---

## Estrutura

```
data/
  trabalhos.json      ← os dados. FORA do backoffice, e por isso a salvo dele.
  vitrine.json        ← a ordem e o mostrar/esconder. É o ficheiro do backoffice.
  autor.json          ← os contactos.
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

## Backoffice

Dois ecrãs, oito campos. É [Pages CMS](https://pagescms.org) (grátis, MIT, sem cartão),
configurado em `.pages.yml`.

**Cartões** — `data/vitrine.json`, três campos por linha:
- **Mostrar** — desliga para esconder o cartão. Os contadores do topo, as contagens dos
  chips de sector e os concelhos do mapa recalculam-se sozinhos.
- **Cartão** — só um rótulo para a lista. O nome que aparece no site vem dos dados, e o
  build repõe este a cada publicação.
- **Identificador** — o que liga a linha aos dados. Não mexer.

**A ordem desta lista é a ordem da página.** Arrastam-se os itens pelo puxador à
esquerda. O Pages CMS usa `@dnd-kit/sortable` no formulário de entrada (confirmado em
`components/entry/entry-form.tsx` do projecto; os docs não o mencionam).

**Contactos** — `data/autor.json`, o telemóvel e o WhatsApp. Deixar um campo vazio faz
o botão correspondente desaparecer da página; nada é inventado.

### Porque é que o backoffice é tão pequeno

O Pages CMS reescreve o ficheiro inteiro ao gravar e **apaga as chaves que o
`.pages.yml` não declara**. A primeira versão deste backoffice expunha o
`data/trabalhos.json` e tinha de declarar os 27 campos todos — incluindo os que já não
aparecem na página — só para não os perder. Ficou uma parede de campos para chegar a um
interruptor.

Agora há dois ficheiros com donos diferentes:

| ficheiro | dono | conteúdo |
|---|---|---|
| `data/trabalhos.json` | o repositório | tudo: nomes, endereços, cores, concelhos, coordenadas |
| `data/vitrine.json` | o backoffice | a ordem e o mostrar/esconder |
| `data/autor.json` | o backoffice | os contactos |

O `trabalhos.json` **não está declarado no `.pages.yml`**, logo o backoffice nem o vê —
e não lhe pode apagar nada. Guardas do build:

- um `id` na vitrine que não exista nos dados **pára a publicação**, com a mensagem a
  dizer qual;
- um trabalho novo nos dados e ainda não na vitrine **entra no fim** e o build avisa —
  acrescentar um trabalho não obriga a mexer em dois ficheiros na ordem certa;
- o `nome` da vitrine é reescrito dos dados a cada build, por isso não pode ficar
  desencontrado.

**Activar, uma vez só:** ir a [app.pagescms.org](https://app.pagescms.org), entrar com o
GitHub, instalar a app neste repositório. As duas colecções aparecem sozinhas. Para dar
acesso a outra pessoa sem conta GitHub: convidar por email no painel do Pages CMS.

**O que acontece ao gravar:** o CMS faz commit em `main` → o GitHub Actions corre
`node _source/build.mjs`, escreve o `index.html` de volta e publica. Um a três minutos.
Se os dados ficarem inválidos, o build falha e **nada é publicado** — a página no ar
continua a última que estava boa.

Ao editar localmente, correr sempre primeiro:

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

70 afirmações verificadas num browser a sério, com rato, dedo e teclado: contagens que
têm de bater umas com as outras, o filtro por sector (e que o **mapa não é filtrado**),
os três modos da fita a 1440/800/375 px, apontar ±3 px em doze concelhos, o painel a
abrir no hover e a sobreviver ao rato entrar nele, o clique a prendê-lo, o Escape a
fechá-lo, o painel a flutuar sobre o mapa junto à mancha no telemóvel e a fechar ao
tocar fora, zero paradas de tabulação no mapa, zero alvos abaixo de 24 px, o botão de
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
   308 e a `lat`/`lon` tem de ser o centróide desse concelho — o build verifica). Não é
   preciso tocar na `vitrine.json`: o build acrescenta a linha no fim e avisa; depois
   arrasta-se para o lugar no backoffice.
2. `node _source/pipeline/1-capturar.mjs <id>` e acrescentar o `id` à lista `SITES`.
3. `python3 _source/pipeline/2-capturas.py && python3 _source/pipeline/3-logos.py`
4. `node _source/build.mjs`

Nenhuma contagem precisa de ser tocada: são todas recalculadas.

## O botão de gestão

No rodapé, ao lado do telemóvel: **Gestão**, para `app.pagescms.org`. É só um atalho —
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
