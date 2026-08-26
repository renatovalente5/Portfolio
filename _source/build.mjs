#!/usr/bin/env node
// Gerador do portfólio. Zero dependências de runtime e zero em tempo de construção:
// só node:fs / node:path. Escreve index.html, assets/mapa.svg e assets/portfolio.css
// a partir de data/*.json. Nada no HTML é escrito à mão — nem um número.
//
//   node _source/build.mjs            constrói
//   node _source/build.mjs --auditar  constrói e falha se alguma verificação falhar

import { readFileSync, writeFileSync, existsSync, readdirSync, statSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { ajustarPara, familia, matiz, normalizada, contraste, deHex, paraHex, paraOklch, deOklch } from './cor.mjs'

const AQUI = dirname(fileURLToPath(import.meta.url))
const RAIZ = join(AQUI, '..')
const ler = p => JSON.parse(readFileSync(join(RAIZ, p), 'utf8'))
const AUDITAR = process.argv.includes('--auditar')

const TODOS = ler('data/trabalhos.json')
// `visivel: false` esconde o trabalho da página. É o único botão do backoffice, e
// TODOS os números da página se recalculam a partir daqui — não há nada escrito à mão.
const trabalhos = TODOS.filter(t => t.visivel !== false)
const escondidos = TODOS.length - trabalhos.length
const autor = ler('data/autor.json')
const capturas = ler('_source/dados/capturas.json')
const logos = ler('_source/dados/logos.json')
const mapa = ler('_source/dados/mapa-continente.json')
const concelhos = ler('_source/dados/concelhos.json')

const erros = [], avisos = []
const falha = m => erros.push(m)
const aviso = m => avisos.push(m)

// ── fundos da página, para o cálculo de contraste das marcas ────────────────
const PAPEL = '#FBFAF8'
const NOITE = '#101114'

const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
const semAcentos = s => s.normalize('NFD').replace(/[̀-ͯ]/g, '')
const slug = s => semAcentos(String(s)).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
const nDigitos = n => String(n)
const POR_EXTENSO = ['zero','uma','duas','três','quatro','cinco','seis','sete','oito','nove','dez','onze','doze',
  'treze','catorze','quinze','dezasseis','dezassete','dezoito','dezanove','vinte']
const extenso = (n, f = false) => {
  const p = POR_EXTENSO[n]
  if (!p) return String(n)
  if (n === 1) return f ? 'uma' : 'um'
  if (n === 2) return f ? 'duas' : 'dois'
  return p
}
const maiuscula = s => s.charAt(0).toUpperCase() + s.slice(1)

// ── 1. VERIFICAR OS DADOS ──────────────────────────────────────────────────
const OBRIG = ['id','nome','endereco','url','sector','sector_nome','actividade','tema','marca','resumo','destaque']
for (const t of trabalhos) {
  for (const c of OBRIG) if (t[c] === undefined || t[c] === null || t[c] === '') falha(`${t.id||'?'}: falta "${c}"`)
  if (!/^#[0-9A-Fa-f]{6}$/.test(t.marca || '')) falha(`${t.id}: marca "${t.marca}" não é um hex de 6`)
  if (!capturas[t.id]) falha(`${t.id}: sem capturas em _source/dados/capturas.json`)
  if (!logos[t.id]) falha(`${t.id}: sem logótipo em _source/dados/logos.json`)
  if (t.concelho) {
    const c = concelhos.find(([n]) => n === t.concelho)
    if (!c) falha(`${t.id}: concelho "${t.concelho}" não existe na lista dos 308`)
    else {
      if (Math.abs(c[1] - t.lat) > 0.02 || Math.abs(c[2] - t.lon) > 0.02)
        falha(`${t.id}: lat/lon não são o centróide de ${t.concelho} (${c[1]},${c[2]})`)
      if (!mapa.concelhos.find(m => m.nome === t.concelho))
        falha(`${t.id}: concelho "${t.concelho}" não está no mapa do continente`)
    }
  }
  const url = t.url || ''
  if (!url.startsWith('https://')) falha(`${t.id}: url tem de ser https`)
  if (!url.replace(/^https:\/\//, '').startsWith(t.endereco))
    falha(`${t.id}: endereco "${t.endereco}" não corresponde ao url "${url}"`)
}
const ids = trabalhos.map(t => t.id)
if (new Set(ids).size !== ids.length) falha('ids repetidos em trabalhos.json')

// ── 2. CONTACTOS: nunca inventados. Ausentes => os blocos não são escritos ──
const PLACEHOLDER = /^(xxx|todo|placeholder|9xx|000|\?+)/i
const temContacto = k => autor[k] && !PLACEHOLDER.test(String(autor[k]))
const TEL = temContacto('telefone') ? String(autor.telefone) : null
const TEL_TXT = TEL ? (autor.telefone_display || TEL) : null
const WA = temContacto('whatsapp') ? String(autor.whatsapp) : null
const MAIL = temContacto('email') ? String(autor.email) : null
if (!TEL) aviso('data/autor.json: telefone em falta — os botões de "Ligar" NÃO foram escritos no HTML')
// NIF, morada, email e WhatsApp estão a null por decisão, não por esquecimento:
// não se avisa por uma decisão, avisa-se por uma falta.
const SEM_CONTACTO = !TEL && !WA && !MAIL

// ── 3. NÚMEROS — todos calculados, nenhum escrito à mão ────────────────────
const N = trabalhos.length
const localizados = trabalhos.filter(t => t.concelho)
const porConcelho = new Map()
for (const t of localizados) porConcelho.set(t.concelho, (porConcelho.get(t.concelho) || 0) + 1)
const concelhosOrd = [...porConcelho.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'pt'))

const porSector = new Map()
for (const t of trabalhos) porSector.set(t.sector, { nome: t.sector_nome, n: (porSector.get(t.sector)?.n || 0) + 1 })
const sectoresOrd = [...porSector.entries()].sort((a, b) => b[1].n - a[1].n || a[1].nome.localeCompare(b[1].nome, 'pt'))
if (sectoresOrd.reduce((s, [, v]) => s + v.n, 0) !== N) falha('as contagens por sector não somam ' + N)

const nDominio = trabalhos.filter(t => t.dominio_proprio).length
const nBackoffice = trabalhos.filter(t => t.backoffice).length
const nGerador = trabalhos.filter(t => t.gerador).length
const nLoja = trabalhos.filter(t => t.loja).length
const nMulti = trabalhos.filter(t => (t.linguas || 1) > 1).length
const nEscuro = trabalhos.filter(t => t.tema === 'escuro').length
const nClaro = N - nEscuro

// censo cromático, calculado a partir dos hex
const fam = new Map()
for (const t of trabalhos) {
  const f = familia(t.marca)
  if (!fam.has(f)) fam.set(f, [])
  fam.get(f).push(t)
}
const famOrd = [...fam.entries()].sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0], 'pt'))

// ── 4. ORDEM: é a ordem do ficheiro data/trabalhos.json, e mais nada ────────
// Assim o Renato manda na ordem: no backoffice arrastam-se os itens da lista (o Pages
// CMS usa @dnd-kit/sortable no formulário de entrada) e a página segue.
// O ficheiro está semeado em norte→sul, com o Praiómetro — que não tem concelho — no fim.
const ordenados = [...trabalhos]

// O primeiro cartão de cada concelho, na ordem em que a grelha o desenha (norte→sul).
// É o destino da âncora do nome na lista.
const primeiroDoConcelho = new Map()
for (const t of ordenados) {
  if (!t.concelho) continue
  const sl = slug(t.concelho)
  if (!primeiroDoConcelho.has(sl)) primeiroDoConcelho.set(sl, t.id)
}

// ── 5. COR: para cada marca, a variante legível em cada um dos dois fundos ──
for (const t of trabalhos) {
  t.marca_claro = ajustarPara(t.marca, PAPEL, 4.5)     // texto sobre papel
  t.marca_escuro = ajustarPara(t.marca, NOITE, 4.5)    // texto sobre noite
  t.marca_banda = normalizada(t.marca, 0.68)           // presença óptica igual na fita
  t.familia = familia(t.marca)
  t.matiz = matiz(t.marca)
  const cc = contraste(deHex(t.marca_claro), deHex(PAPEL))
  const ce = contraste(deHex(t.marca_escuro), deHex(NOITE))
  if (cc < 4.49) falha(`${t.id}: marca_claro ${t.marca_claro} só dá ${cc.toFixed(2)}:1 sobre ${PAPEL}`)
  if (ce < 4.49) falha(`${t.id}: marca_escuro ${t.marca_escuro} só dá ${ce.toFixed(2)}:1 sobre ${NOITE}`)
}

// ── 6. MAPA: SVG externo com os 278 concelhos do continente ────────────────
const VB = mapa.viewBox
const comTrabalho = new Set(localizados.map(t => t.concelho))
{
  const fundo = [], destaque = []
  for (const c of mapa.concelhos) {
    if (comTrabalho.has(c.nome)) destaque.push(c)
    else fundo.push(`<path d="${c.d}"/>`)
  }
  if (destaque.length !== comTrabalho.size)
    falha(`mapa: ${destaque.length} concelhos com trabalho desenhados, esperados ${comTrabalho.size}`)
  // Um <img> não herda o CSS da página: o tema vive dentro do próprio SVG.
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${VB[2]} ${VB[3]}" role="img" aria-label="Mapa administrativo de Portugal continental">
<style>
 .t{fill:#EFEDE7;stroke:#DCD8CF;stroke-width:.75;stroke-linejoin:round}
 .v{fill:#E4E1D9;stroke:#CFCAC0;stroke-width:.75;stroke-linejoin:round}
 @media (prefers-color-scheme:dark){
  .t{fill:#1B1D22;stroke:#2A2D34}
  .v{fill:#23262C;stroke:#343841}
 }
</style>
<g class="t">${fundo.join('')}</g>
<g class="v">${destaque.map(c => `<path d="${c.d}"/>`).join('')}</g>
</svg>`
  writeFileSync(join(RAIZ, 'assets/mapa.svg'), svg)
}

// Camada interactiva: só os concelhos com trabalho, para poderem ser pintados e
// animados. Um concelho com vários trabalhos NÃO recebe uma das marcas escolhida a
// dedo (seria mentira) nem cinzento (seria o mais apagado justamente onde há mais
// trabalho): recebe um gradiente de faixas com as cores verdadeiras dos trabalhos
// que estão lá. Santa Maria da Feira, com cinco, fica a peça mais rica do mapa.
const destaquePaths = mapa.concelhos.filter(c => comTrabalho.has(c.nome))
const gradientes = []
function pinturaDoConcelho (nome) {
  const ts = localizados.filter(t => t.concelho === nome)
    .sort((a, b) => a.matiz - b.matiz)
  if (ts.length === 1) return { estilo: ` style="--m:${ts[0].marca_banda}"` }
  const id = 'g-' + slug(nome)
  const passo = 100 / ts.length
  const paradas = ts.flatMap((t, i) =>
    [`<stop offset="${(i * passo).toFixed(2)}%" stop-color="${t.marca_banda}"/>`,
     `<stop offset="${((i + 1) * passo).toFixed(2)}%" stop-color="${t.marca_banda}"/>`]).join('')
  gradientes.push(`<linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1">${paradas}</linearGradient>`)
  return { estilo: ` style="--m:url(#${id})" class="varios"` }
}
const svgSobreposto = `<svg class="mapa-cima" viewBox="0 0 ${VB[2]} ${VB[3]}" aria-hidden="true" focusable="false">
<g class="conc">${destaquePaths.map(c =>
  `<path d="${c.d}" data-concelho="${slug(c.nome)}" data-nome="${esc(c.nome)}"` +
  ` data-n="${porConcelho.get(c.nome)}" data-cx="${c.cx}" data-cy="${c.cy}"` +
  `${pinturaDoConcelho(c.nome).estilo}/>`).join('')}</g>
<defs>__GRAD__</defs></svg>`

// ── 7. FICHAS ──────────────────────────────────────────────────────────────
const BASE_CAP = 'assets/capturas'
// Os sites que ainda estão no github do Renato em vez do domínio final do cliente.
const ETIQUETA_DEV = 'Em desenvolvimento'
const nDev = trabalhos.filter(t => t.em_desenvolvimento).length
for (const t of trabalhos) {
  if (t.em_desenvolvimento && t.dominio_proprio)
    aviso(`${t.id}: marcado em desenvolvimento mas já tem domínio próprio — confirmar`)
}
function ficha (t) {
  const cap = capturas[t.id]
  const lg = logos[t.id]
  const largo = t.destaque_largo ? ' ficha--largo' : ''
  const src = (w) => `${BASE_CAP}/${t.id}-${w}.webp`
  const srcset = cap.desktop.map(([w]) => `${src(w)} ${w}w`).join(', ')
  const tel = cap.telefone.length ? `${BASE_CAP}/${t.id}-t${cap.telefone[0][0]}.webp` : null
  const telH = tel ? Math.round(cap.telefone[0][0] / cap.racio_telefone) : 0
  // Duas, no máximo, e só quando são verdade. São dados, não prosa: dizem o que o
  // site faz pelo negócio, sem falar de preço nem de alojamento.
  const etiquetas = []
  if (t.loja) etiquetas.push('Loja online')
  const onde = t.concelho ? `${esc(t.localidade)}${t.localidade !== t.concelho ? ', ' + esc(t.concelho) : ''}` : esc(t.localidade)
  return `<article class="ficha${largo}${t.em_desenvolvimento ? ' ficha--dev' : ''}" id="t-${t.id}" data-id="${t.id}" data-sector="${t.sector}"` +
    ` data-concelho="${t.concelho ? slug(t.concelho) : ''}"` +
    ` style="--m:${t.marca};--mc:${t.marca_claro};--me:${t.marca_escuro}">
 <span class="filete"></span>
 <div class="visor">
  <span class="moldura"><i aria-hidden="true"></i><i aria-hidden="true"></i><i aria-hidden="true"></i>
   <b aria-hidden="true">${esc(t.endereco)}</b>${t.em_desenvolvimento
     ? `<em>${esc(ETIQUETA_DEV)}</em>` : ''}</span>
  <img class="ecra" src="${src(720)}" srcset="${srcset}"
       sizes="(min-width:1080px) 31vw,(min-width:620px) 46vw,92vw"
       width="1440" height="900" loading="lazy" decoding="async"
       alt="Página inicial do site da ${esc(t.nome)}, em ${esc(t.endereco)}">
  ${tel ? `<img class="tel" src="${tel}" width="${cap.telefone[0][0]}" height="${telH}" loading="lazy" decoding="async" alt="">` : ''}
  <span class="placa" data-forma="${lg.forma}" style="--placa:${lg.placa};--hp:${lg.h_placa}px">
   <img src="assets/logos/${t.id}.webp" width="${lg.w_disp}" height="${lg.h_disp}" loading="lazy" decoding="async" alt="">
  </span>
 </div>
 <h3><a href="${t.url}" target="_blank" rel="noopener">${esc(t.nome)}<span class="rl"> — abre o site noutro separador</span></a></h3>
 <p class="meta">${esc(t.actividade)} · ${onde}</p>
 ${etiquetas.length ? `<p class="etiquetas">${etiquetas.map(e => `<span>${esc(e)}</span>`).join('')}</p>` : ''}
 <p class="cta" aria-hidden="true">Ver o site <span>↗</span></p>
</article>`
}

// ── 8. PEÇAS DE TEXTO ──────────────────────────────────────────────────────
const fita = ordenados.map(t =>
  `<i data-id="${t.id}" style="--m:${t.marca_banda}"></i>`).join('')

const contadores = [
  [N, N === 1 ? 'trabalho' : 'trabalhos'],
  [porConcelho.size, porConcelho.size === 1 ? 'concelho' : 'concelhos'],
].map(([n, t]) => `<div><b>${n}</b><span>${esc(t)}</span></div>`).join('')

const chips = `<button type="button" class="chip" aria-pressed="true" data-sector="" data-nome="">Todos <b>${N}</b></button>` +
  sectoresOrd.map(([s, v]) =>
    `<button type="button" class="chip" aria-pressed="false" data-sector="${s}" data-nome="${esc(v.nome)}">${esc(v.nome)} <b>${v.n}</b></button>`).join('')

// Um painel por concelho, com os trabalhos de lá. Abre ao carregar na mancha do mapa.
// Lista SEMPRE todos os trabalhos do concelho: o mapa não é filtrado pelo sector.
const paineis = concelhosOrd.map(([nome, n]) => {
  const ts = localizados.filter(t => t.concelho === nome)
    .sort((a, b) => ordenados.indexOf(a) - ordenados.indexOf(b))
  return `<div class="painel" id="p-${slug(nome)}" data-concelho="${slug(nome)}" hidden>
   <p class="painel-t">${esc(nome)}<b>${n}</b></p>
   <ul>${ts.map(t => `<li style="--m:${t.marca};--mc:${t.marca_claro};--me:${t.marca_escuro}">` +
     `<a href="${t.url}" target="_blank" rel="noopener">${esc(t.nome)}<span aria-hidden="true">↗</span></a>` +
     `<span>${esc(t.actividade)}</span></li>`).join('')}</ul>
   <button type="button" class="painel-x" aria-label="Fechar"><span aria-hidden="true">×</span></button>
  </div>`
}).join('')

// Os concelhos deixaram de ser filtro: é uma legenda do mapa e mais nada.
const corDoConcelho = nome => localizados.filter(t => t.concelho === nome)
  .sort((a, b) => a.matiz - b.matiz)[0]
const listaConcelhos = concelhosOrd.map(([nome, n]) => {
  const sl = slug(nome), c = corDoConcelho(nome)
  return `<li data-concelho="${sl}" style="--mc:${c.marca_claro};--me:${c.marca_escuro}">` +
    `<button type="button" class="cn" aria-expanded="false" aria-controls="p-${sl}">${esc(nome)}` +
    `<span class="rl"> — ver os ${n === 1 ? 'trabalho' : `${n} trabalhos`} deste concelho</span></button>` +
    `${n > 1 ? `<b>${n}</b>` : ''}</li>`
}).join('')

// ── 9. HTML ────────────────────────────────────────────────────────────────
const hoje = new Date()
const DATA_ISO = hoje.toISOString().slice(0, 10)
const MESES = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro']
const DATA_PT = `${hoje.getDate()} de ${MESES[hoje.getMonth()]} de ${hoje.getFullYear()}`
const capturadoEm = Object.values(capturas).map(c => c.capturado_em).sort()[0]
{
  const dias = Math.round((hoje - new Date(capturadoEm)) / 864e5)
  if (dias > 120) falha(`capturas com ${dias} dias (máximo 120) — correr o script de captura outra vez`)
}

const botoes = []
if (TEL) botoes.push(`<a class="b b--1" href="tel:${esc(TEL)}">Ligar ${esc(TEL_TXT)}</a>`)
if (WA) botoes.push(`<a class="b b--2" href="https://wa.me/${esc(WA)}" target="_blank" rel="noopener">WhatsApp</a>`)
if (MAIL) botoes.push(`<a class="b b--${botoes.length ? 2 : 1}" href="mailto:${esc(MAIL)}">Escrever-me</a>`)
if (!botoes.length) botoes.push(`<a class="b b--1" href="#trabalhos">Ver os ${extenso(N)} trabalhos</a>`)

const TITULO = `Renato Valente — sites para empresas portuguesas`
const DESC = `${maiuscula(extenso(N))} sites para empresas portuguesas, em ${extenso(porConcelho.size)} concelhos. Renato Valente${TEL ? ` — ${TEL_TXT}` : ''}.`

const html = `<!doctype html>
<html lang="pt-PT">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(TITULO)}</title>
<meta name="description" content="${esc(DESC)}">
<meta name="author" content="Renato Valente">
<meta name="theme-color" content="${PAPEL}" media="(prefers-color-scheme:light)">
<meta name="theme-color" content="${NOITE}" media="(prefers-color-scheme:dark)">
<meta property="og:type" content="website">
<meta property="og:title" content="${esc(TITULO)}">
<meta property="og:description" content="${esc(DESC)}">
<meta property="og:locale" content="pt_PT">
<link rel="canonical" href="__BASE__/">
<link rel="icon" href="assets/favicon.svg" type="image/svg+xml">
<link rel="preload" href="assets/fontes/schibsted-latin.woff2" as="font" type="font/woff2" crossorigin>
<link rel="preload" href="assets/fontes/plexmono-latin.woff2" as="font" type="font/woff2" crossorigin>
<link rel="stylesheet" href="assets/portfolio.css">
</head>
<body>
<a class="salto" href="#trabalhos">Saltar para os trabalhos</a>

<header class="topo">
 <a class="marca" href="#top"><b>Renato Valente</b></a>
 <nav aria-label="Secções">
  <a href="#trabalhos">Trabalhos</a><a href="#contacto">Contacto</a>
 </nav>
 ${WA ? `<a class="topo-tel" href="https://wa.me/${esc(WA)}" target="_blank" rel="noopener">WhatsApp ${esc(TEL_TXT)}</a>`
       : (TEL ? `<a class="topo-tel" href="tel:${esc(TEL)}">Ligar ${esc(TEL_TXT)}</a>` : '')}
</header>
<div class="fita" id="fita" data-modo="todas" aria-hidden="true">${fita}</div>

<main id="top">

<section class="cabeca">
 <h1>Faço sites para empresas portuguesas.<br><em>${maiuscula(extenso(N))}, até agora.</em></h1>
 <div class="contadores">${contadores}</div>
 <p class="botoes">${botoes.join('')}</p>
 ${TEL ? '<p class="micro">(chamada para a rede móvel nacional)</p>' : ''}
</section>

<section id="onde" class="onde">
 <div class="onde-txt">
  <h2>Onde estão</h2>
  <ul class="conc-lista">${listaConcelhos}</ul>
 </div>
 <figure class="mapa">
  <div class="mapa-caixa">
   <img src="assets/mapa.svg" width="${VB[2]}" height="${VB[3]}" loading="lazy" decoding="async" draggable="false"
        alt="Mapa de Portugal continental com os ${extenso(porConcelho.size)} concelhos onde há trabalhos assinalados: ${concelhosOrd.map(([n, q]) => q > 1 ? `${n} (${q})` : n).join(', ')}.">
   ${svgSobreposto}
   ${paineis}
  </div>
 </figure>
</section>

<section id="trabalhos" class="trabalhos">
 <div class="controlos">
  <h2>Trabalhos</h2>
  <div class="chips" role="group" aria-label="Filtrar por sector">${chips}</div>
  <p class="resultado" id="resultado" aria-live="polite">${N} trabalhos</p>
 </div>
 <div class="grelha" id="grelha">${ordenados.map(ficha).join('\n')}</div>
</section>

<section id="contacto" class="contacto">
 <h2>Falar comigo</h2>
 ${SEM_CONTACTO ? '' : `<div class="cx">
  ${TEL ? `<a class="cx-num" href="tel:${esc(TEL)}"><span>${esc(TEL_TXT)}</span></a>` : ''}
  <p class="cx-bt">${[
    WA ? `<a class="b b--1" href="https://wa.me/${esc(WA)}" target="_blank" rel="noopener">WhatsApp</a>` : '',
    TEL ? `<a class="b b--2" href="tel:${esc(TEL)}">Ligar</a>` : '',
  ].filter(Boolean).join('')}</p>
 </div>
 ${TEL ? '<p class="micro">(chamada para a rede móvel nacional)</p>' : ''}`}
</section>

</main>

<footer class="rodape">
 <p class="rod-1"><b>Renato Valente</b>${TEL ? ` · <a href="tel:${esc(TEL)}">${esc(TEL_TXT)}</a>` : ''}${
   autor.github ? ` · <a class="gestao" href="https://app.pagescms.org" target="_blank" rel="noopener">Gestão</a>` : ''}</p>
 <p>Mapa: Carta Administrativa Oficial de Portugal, DGT.</p>
</footer>

${(TEL || WA) ? `<div class="accao">${[
  TEL ? `<a href="tel:${esc(TEL)}">Ligar ${esc(TEL_TXT)}</a>` : '',
  WA ? `<a href="https://wa.me/${esc(WA)}" target="_blank" rel="noopener">WhatsApp</a>` : '',
].filter(Boolean).join('')}</div>` : ''}

<button class="subir" type="button" hidden>
 <span class="rl">Voltar ao topo da página</span><span aria-hidden="true">↑</span>
</button>

<script src="assets/portfolio.js" defer></script>
</body>
</html>
`

// resolver __BASE__ a partir do CNAME, se existir
const cname = existsSync(join(RAIZ, 'CNAME')) ? readFileSync(join(RAIZ, 'CNAME'), 'utf8').trim() : ''
const BASE = cname ? `https://${cname}` : 'https://renatovalente5.github.io/Portfolio'
writeFileSync(join(RAIZ, 'index.html'),
  html.replaceAll('__BASE__', BASE).replace('__GRAD__', gradientes.join('')))


// ── 10. AUDITORIA ──────────────────────────────────────────────────────────
const tam = p => existsSync(join(RAIZ, p)) ? statSync(join(RAIZ, p)).size : 0
const kb = n => (n / 1024).toFixed(1) + ' KB'
const htmlB = tam('index.html'), cssB = tam('assets/portfolio.css'), jsB = tam('assets/portfolio.js')
const mapaB = tam('assets/mapa.svg')
if (htmlB > 200 * 1024) falha(`index.html tem ${kb(htmlB)} (máximo 200 KB em bruto)`)
if (cssB && cssB > 44 * 1024) falha(`portfolio.css tem ${kb(cssB)} (máximo 44 KB em bruto)`)
if (jsB && jsB > 22 * 1024) falha(`portfolio.js tem ${kb(jsB)} (máximo 22 KB em bruto)`)
for (const t of trabalhos) {
  const l = join(RAIZ, `assets/logos/${t.id}.webp`)
  if (!existsSync(l)) falha(`${t.id}: falta assets/logos/${t.id}.webp`)
  else if (statSync(l).size > 10 * 1024) aviso(`${t.id}: logótipo tem ${kb(statSync(l).size)}`)
  for (const [w] of capturas[t.id].desktop) {
    const c = join(RAIZ, `assets/capturas/${t.id}-${w}.webp`)
    if (!existsSync(c)) falha(`${t.id}: falta a captura ${w}w`)
    else if (w === 1080 && statSync(c).size > 80 * 1024) aviso(`${t.id}: captura 1080w tem ${kb(statSync(c).size)}`)
  }
}
// nenhum contacto escrito à mão no HTML
const gerado = readFileSync(join(RAIZ, 'index.html'), 'utf8')
for (const m of gerado.matchAll(/(tel:|wa\.me\/|mailto:)([^"'<\s]*)/g)) {
  const v = m[2]
  const legit = [TEL, WA, MAIL].filter(Boolean).some(x => v.includes(String(x).replace(/\s/g, '')) || String(x).includes(v))
  if (!legit) falha(`contacto no HTML que não vem de autor.json: ${m[0]}`)
}
// Nenhum número de trabalhos escrito à mão que contradiga N. A verificação corre
// sobre o HTML com os textos vindos dos dados removidos — senão «vinte e seis peças»,
// que é o resumo verdadeiro do Pau Ferro, dispara um falso positivo.
{
  let semDados = gerado
  for (const t of trabalhos) {
    for (const campo of [t.resumo, t.destaque, t.actividade, t.nome, ...(t.tech || [])]) {
      if (campo) semDados = semDados.split(esc(campo)).join(' ')
    }
  }
  for (const m of semDados.matchAll(/\b(dezasseis|dezassete|dezoito|dezanove|vinte|vinte e um)\b/g)) {
    if (m[1] !== extenso(N)) falha(`número por extenso "${m[1]}" no HTML gerado, mas há ${N} trabalhos`)
  }
  if (!semDados.toLowerCase().includes(extenso(N))) aviso(`o número de trabalhos (${extenso(N)}) não aparece por extenso no HTML`)
}

if (!trabalhos.length) falha('todos os trabalhos estão com visivel:false — a página ficaria vazia')
if (escondidos) console.log(`\n  ${escondidos} ${escondidos === 1 ? 'trabalho escondido' : 'trabalhos escondidos'} (visivel:false) — não contam para nada`)
console.log(`\n  ${N} trabalhos · ${porConcelho.size} concelhos · ${nDominio} com .pt · ${nBackoffice} com backoffice`)
console.log(`  sectores: ${sectoresOrd.map(([, v]) => `${v.nome} ${v.n}`).join(' · ')}`)
console.log(`  censo:    ${famOrd.map(([f, ts]) => `${f} ${ts.length}`).join(' · ')}`)
console.log(`\n  index.html ${kb(htmlB)} · mapa.svg ${kb(mapaB)} · css ${kb(cssB)} · js ${kb(jsB)}`)

if (avisos.length) { console.log('\n  AVISOS'); for (const a of avisos) console.log('   • ' + a) }
if (erros.length) {
  console.error('\n  ERROS (' + erros.length + ')')
  for (const e of erros) console.error('   ✗ ' + e)
  process.exit(1)
}
console.log(erros.length ? '' : '\n  ok\n')
if (AUDITAR && avisos.length) {
  console.error('  --auditar: há avisos por resolver.')
  process.exit(2)
}
