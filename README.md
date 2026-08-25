# Portefólio — Renato Valente

Página única com os sites que fiz para empresas portuguesas. Alojada no GitHub Pages,
100 % estática, sem dependências de runtime.

**No ar:** https://renatovalente5.github.io/Portfolio/

---

## O que é

Uma página. `index.html` **é gerado** — nunca se edita à mão. Tudo o que aparece na
página (contagens, censo de cores, mapa, ordem dos trabalhos, frases com números)
sai de `data/*.json` através de `_source/build.mjs`.

O que a página tem de diferente:

- **O Compasso.** O visitante escreve o concelho dele e a página mede a distância a
  cada trabalho, reordena os cartões do mais perto para o mais longe, escreve a
  distância em cada um, e desenha no mapa a posição dele com arcos de 50 e 100 km.
  É a resposta à única pergunta que um dono de PME tem: *«ele já fez isto para gente
  como eu, aqui perto?»*
- **Mapa administrativo verdadeiro.** 278 concelhos do continente, fronteiras da
  Carta Administrativa Oficial de Portugal (via `json.geoapi.pt`), projectados no
  build. Os 12 concelhos com trabalho aparecem pintados com a cor da marca do
  cliente — e, quando há mais do que um trabalho no mesmo concelho, em faixas com as
  cores verdadeiras de todos eles. Nada é do Google.
- **Quarentena da cor.** A página não tem cor própria. A única cor da interface é
  `--sinal`. Toda a outra cor pertence a um cliente e vive em quatro sítios de área
  mínima: o filete de 3 px do cartão, a banda da fita, o concelho no mapa e a amostra
  do censo. É o que permite a 18 marcas incompatíveis coexistirem sem ruído.
- **Capturas reais.** Cada cartão mostra o site em desktop e em telemóvel, dentro de
  uma moldura de browser com o **endereço verdadeiro** — para o visitante poder ir
  verificar.
- **Nada escrito à mão.** O gerador tem uma auditoria com travões: se as contagens
  por sector não somarem, se uma cor de marca não der 4,5:1 contra o fundo, se um
  contacto no HTML não vier de `data/autor.json`, se as capturas tiverem mais de 120
  dias, ou se um número por extenso contradisser o número real de trabalhos, o build
  falha.

---

## Estrutura

```
data/
  trabalhos.json      ← a fonte de verdade dos trabalhos
  autor.json          ← nome, contactos, preço, prazo (ver «Em falta»)
  concelhos.json      ← 308 concelhos com centróide; só é buscado quando o Compasso é usado
_source/
  build.mjs           ← o gerador (só node:fs / node:path)
  cor.mjs             ← sRGB ↔ OKLab/OKLCh, contraste WCAG, famílias de matiz
  dados/              ← entradas geradas pelo pipeline (mapa, capturas, logótipos)
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
node _source/build.mjs            # gera index.html + assets/mapa.svg
node _source/build.mjs --auditar  # idem, mas falha também com avisos (é o que o CI corre)
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
a captura mente), renderiza a página inteira a 390/768/1280 px em claro e escuro,
grava as imagens em `_source/tmp/ver/`, e falha se houver overflow horizontal,
elementos fora do ecrã, alvos com menos de 24 px, imagens sem `width`/`height` ou
erros na consola.

## Pipeline (só quando os dados de origem mudam)

Por ordem. Precisa de Chrome, `python3` com Pillow, `cwebp` e ligação à internet.

```bash
_source/pipeline/0-municipios.sh          # descarrega as geometrias dos 308 municípios (CAOP)
python3 _source/pipeline/4-geo.py         # -> data/concelhos.json + _source/dados/mapa-continente.json
node    _source/pipeline/1-capturar.mjs   # capturas dos 18 sites (desktop + telemóvel)
python3 _source/pipeline/2-capturas.py    # -> assets/capturas/*.webp
python3 _source/pipeline/3-logos.py       # -> assets/logos/*.webp + a cor de cada placa
node    _source/build.mjs --auditar
```

`1-capturar.mjs` fecha sozinho os avisos de cookies (preferindo *rejeitar*) e, para
sites multilingues, força o português antes de disparar — ver a constante `PREP`.

`3-logos.py` **não redesenha nem recolore** a arte do cliente. Escolhe a variante do
logótipo e resolve a cor da placa (tinta quase-preta ou branco) medindo, pixel a
pixel, qual das duas perde menos arte e mantém o quartil inferior de contraste acima
de 2,6:1; a logótipos de traço fino dá mais altura.

## Acrescentar um trabalho

1. Juntar a entrada a `data/trabalhos.json` (todos os campos são obrigatórios; o
   `concelho` tem de existir na lista dos 308 e a `lat`/`lon` tem de ser o centróide
   desse concelho — o build verifica).
2. `node _source/pipeline/1-capturar.mjs <id>` e acrescentar o `id` à lista `SITES`.
3. `python3 _source/pipeline/2-capturas.py && python3 _source/pipeline/3-logos.py`
4. `node _source/build.mjs --auditar`

Nenhuma contagem, percentagem ou frase precisa de ser tocada: são todas recalculadas.

---

## Em falta

`data/autor.json` tem campos a `null`. **O gerador não inventa contactos**: enquanto
estiverem a `null`, os botões de telefone/WhatsApp/email, a barra fixa de acção e o
bloco «quanto custa» **não são escritos no HTML**, e o build avisa. Preencher e
correr o build outra vez:

- `telefone` / `telefone_display` / `whatsapp` / `email`
- `preco_desde` / `prazo_semanas` — o dono de PME pergunta sempre, e a página ainda
  não responde
- `nif` / `morada` — identificação do prestador exigida pelo DL 7/2004

## Domínio

Está em `renatovalente5.github.io/Portfolio`. Para passar a domínio próprio: criar um
ficheiro `CNAME` na raiz com o domínio, correr o build (o `canonical` passa a apontar
para lá automaticamente) e configurar o DNS.
