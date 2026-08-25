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

const trabalhos = ler('data/trabalhos.json')
const autor = ler('data/autor.json')
const capturas = ler('_source/dados/capturas.json')
const logos = ler('_source/dados/logos.json')
const mapa = ler('_source/dados/mapa-continente.json')
const concelhos = ler('data/concelhos.json')

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
const PRECO = autor.preco_desde && !PLACEHOLDER.test(String(autor.preco_desde)) ? autor.preco_desde : null
const PRAZO = autor.prazo_semanas && !PLACEHOLDER.test(String(autor.prazo_semanas)) ? autor.prazo_semanas : null
if (!TEL) aviso('data/autor.json: telefone em falta — os botões de "Ligar" NÃO foram escritos no HTML')
if (!WA) aviso('data/autor.json: whatsapp em falta — o botão de WhatsApp NÃO foi escrito')
if (!MAIL) aviso('data/autor.json: email em falta — o contacto por email NÃO foi escrito')
if (!PRECO || !PRAZO) aviso('data/autor.json: preco_desde/prazo_semanas em falta — o bloco "quanto custa" NÃO foi escrito')
if (!autor.nif || !autor.morada) aviso('data/autor.json: nif/morada em falta — a identificação do DL 7/2004 fica incompleta')
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

// ── 4. ORDEM: norte -> sul por latitude; sem concelho vai para o fim ────────
const ordenados = [...trabalhos].sort((a, b) => {
  if (a.lat == null && b.lat == null) return a.nome.localeCompare(b.nome, 'pt')
  if (a.lat == null) return 1
  if (b.lat == null) return -1
  return b.lat - a.lat || a.nome.localeCompare(b.nome, 'pt')
})

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
  gradientes.push(`<linearGradient id="${id}" x1="0" y1="0" x2="1" y2="1">${paradas}</linearGradient>`)
  return { estilo: ` fill="url(#${id})" class="varios"` }
}
const svgSobreposto = `<svg class="mapa-cima" viewBox="0 0 ${VB[2]} ${VB[3]}" aria-hidden="true" focusable="false">
<g class="conc">${destaquePaths.map(c => {
  const n = porConcelho.get(c.nome)
  return `<path d="${c.d}" data-concelho="${slug(c.nome)}" data-n="${n}"${pinturaDoConcelho(c.nome).estilo}/>`
}).join('')}</g>
<g class="compasso" hidden>
 <circle class="arco" id="arco25" r="0" cx="-999" cy="-999"/>
 <circle class="arco" id="arco50" r="0" cx="-999" cy="-999"/>
 <line class="guia" x1="-999" y1="-999" x2="-999" y2="-999"/>
 <g class="eu" transform="translate(-999,-999)"><circle r="7"/><path d="M-11 0h22M0 -11v22"/></g>
</g>
<defs>__GRAD__</defs></svg>`

// ── 7. FICHAS ──────────────────────────────────────────────────────────────
const BASE_CAP = 'assets/capturas'
function ficha (t, i) {
  const cap = capturas[t.id]
  const lg = logos[t.id]
  const largo = t.destaque_largo ? ' ficha--largo' : ''
  const src = (w) => `${BASE_CAP}/${t.id}-${w}.webp`
  const srcset = cap.desktop.map(([w]) => `${src(w)} ${w}w`).join(', ')
  const tel = cap.telefone.length ? `${BASE_CAP}/${t.id}-t${cap.telefone[0][0]}.webp` : null
  const telH = tel ? Math.round(cap.telefone[0][0] / cap.racio_telefone) : 0
  const onde = t.concelho ? `${esc(t.localidade)}${t.localidade !== t.concelho ? ', ' + esc(t.concelho) : ''}` : esc(t.localidade)
  const etiquetas = []
  if (t.dominio_proprio) etiquetas.push('domínio próprio')
  if (t.backoffice) etiquetas.push('edita sozinho')
  if (t.loja) etiquetas.push('loja online')
  if ((t.linguas || 1) > 1) etiquetas.push(`${t.linguas} línguas`)
  return `<article class="ficha${largo}" data-id="${t.id}" data-sector="${t.sector}"` +
    (t.concelho ? ` data-concelho="${slug(t.concelho)}" data-lat="${t.lat}" data-lon="${t.lon}"` : ' data-concelho=""') +
    ` style="--m:${t.marca};--mc:${t.marca_claro};--me:${t.marca_escuro}">
 <span class="filete"></span>
 <div class="visor">
  <span class="moldura" aria-hidden="true"><i></i><i></i><i></i><b>${esc(t.endereco)}</b></span>
  <img class="ecra" src="${src(720)}" srcset="${srcset}"
       sizes="(min-width:1080px) 31vw,(min-width:620px) 46vw,92vw"
       width="1440" height="900" loading="lazy" decoding="async"
       alt="Página inicial do site da ${esc(t.nome)}, em ${esc(t.endereco)}">
  ${tel ? `<img class="tel" src="${tel}" width="${cap.telefone[0][0]}" height="${telH}" loading="lazy" decoding="async" alt="">` : ''}
  <span class="placa" data-forma="${lg.forma}" style="--placa:${lg.placa};--hp:${lg.h_placa}px">
   <img src="assets/logos/${t.id}.webp" width="${lg.w_disp}" height="${lg.h_disp}" loading="lazy" decoding="async" alt="">
  </span>
 </div>
 <p class="num" aria-hidden="true">${String(i + 1).padStart(2, '0')}</p>
 <h3><a href="${t.url}" target="_blank" rel="noopener">${esc(t.nome)}<span class="rl"> — abre o site noutro separador</span></a></h3>
 <p class="meta">${esc(t.actividade)} · ${onde}<span class="km" hidden></span>${
   t.tema === 'escuro' ? '<span class="escuro" title="site de tema escuro" aria-hidden="true"></span>' : ''}</p>
 <p class="resumo">${esc(t.resumo)}</p>
 <p class="destaque"><span aria-hidden="true">↳</span> ${esc(t.destaque)}</p>
 ${etiquetas.length ? `<ul class="etiq">${etiquetas.map(e => `<li>${esc(e)}</li>`).join('')}</ul>` : ''}
 <p class="cta" aria-hidden="true">Ver o site <span>↗</span></p>
</article>`
}

// ── 8. PEÇAS DE TEXTO ──────────────────────────────────────────────────────
const fita = ordenados.map(t =>
  `<i data-id="${t.id}" style="--m:${t.marca_banda}"></i>`).join('')

const contadores = [
  [N, 'sites no ar'],
  [porConcelho.size, porConcelho.size === 1 ? 'concelho' : 'concelhos'],
  [nDominio, 'com domínio .pt próprio'],
  [nBackoffice, 'que o cliente edita sozinho'],
].map(([n, t]) => `<div><b>${n}</b><span>${esc(t)}</span></div>`).join('')

const chips = `<button type="button" class="chip" aria-pressed="true" data-sector="">Todos <b>${N}</b></button>` +
  sectoresOrd.map(([s, v]) =>
    `<button type="button" class="chip" aria-pressed="false" data-sector="${s}">${esc(v.nome)} <b>${v.n}</b></button>`).join('')

// Os concelhos são o segundo eixo de filtro. Ficam ao lado dos sectores, em vez de
// uma lista de doze linhas de 46px que empurrava o mapa 550px para baixo no telemóvel.
const chipsConcelho = concelhosOrd.map(([nome, n]) =>
  `<button type="button" class="chip chip--c" aria-pressed="false" data-concelho="${slug(nome)}" data-n="${n}">` +
  `${esc(nome)} <b>${n}</b><span class="cd" hidden></span></button>`).join('')

// censo: frase gerada, incluindo o "nove das dezoito" que ninguém escreve à mão
const censoFrase = (() => {
  const partes = famOrd.map(([f, ts], i) => {
    const q = ts.length
    const nome = { ouro: 'ouro ou âmbar', lima: 'verde-lima', azul: 'azul', verde: 'verde',
                   vermelho: 'vermelho', castanho: 'castanho', turquesa: 'turquesa',
                   laranja: 'laranja', violeta: 'violeta', rosa: 'rosa', neutro: 'cinzento' }[f] || f
    return { q, nome, primeiro: i === 0 }
  })
  const p0 = partes[0]
  let s = `<b>${maiuscula(extenso(p0.q, true))}</b> das ${extenso(N, true)} marcas destes negócios escolheram ${p0.nome}.`
  const resto = partes.slice(1)
  if (resto.length === 1) {
    s += ` As outras ${extenso(resto[0].q, true)} escolheram ${resto[0].nome}.`
  } else if (resto.length > 1) {
    const grandes = resto.filter(p => p.q > 1)
    const unicos = resto.filter(p => p.q === 1)
    if (grandes.length) s += ' ' + grandes.map((p, i) => `${i ? extenso(p.q, true) : maiuscula(extenso(p.q, true))} escolheram ${p.nome}`).join(' e ') + '.'
    if (unicos.length) {
      const soma = unicos.length
      s += ` As outras ${extenso(soma, true)} ${soma === 1 ? 'reparte-se' : 'repartem-se'} por ` +
        unicos.map(p => p.nome).sort((a, b) => a.localeCompare(b, 'pt')).join(', ').replace(/, ([^,]*)$/, ' e $1') + '.'
    }
  }
  s += ` <b>${maiuscula(extenso(nEscuro, false))}</b> destes sites são de tema escuro; <b>${extenso(nClaro, false)}</b>, de tema claro.`
  return s
})()

const censoFita = [...trabalhos].sort((a, b) => a.matiz - b.matiz)
  .map(t => `<i style="--m:${t.marca}" title="${esc(t.nome)} · ${t.marca}"></i>`).join('')

const censoTabela = [...trabalhos].sort((a, b) => a.matiz - b.matiz).map(t =>
  `<tr><th scope="row">${esc(t.nome)}</th><td><span class="am" style="--m:${t.marca}"></span><code>${t.marca}</code></td>` +
  `<td>${t.matiz}°</td><td>${esc(t.familia)}</td></tr>`).join('')

// «Para quem é da área»: números reais, agrupados
const tech = new Map()
for (const t of trabalhos) for (const x of (t.tech || [])) tech.set(x, (tech.get(x) || 0) + 1)

const metodo = [
  [`Carrega depressa, mesmo com rede fraca.`,
   `Nenhum destes ${extenso(N)} sites usa WordPress nem plugins. São páginas escritas em ficheiro, servidas directamente — não há base de dados a consultar nem tema a montar a cada visita.`],
  [`Você edita sozinho.`,
   `${maiuscula(extenso(nBackoffice))} dos ${extenso(N)} têm um painel onde o dono muda preços, fotografias e viaturas a partir do telemóvel, sem me pagar por cada alteração.`],
  [`Sem mensalidades de plataforma.`,
   `O alojamento é gratuito e o domínio fica no nome do cliente. ${maiuscula(extenso(nDominio))} já têm <code>.pt</code> próprio.`],
  [`A parte legal tratada.`,
   `RGPD, Livro de Reclamações electrónico, identificação do prestador e informação de custo de chamada. Onde há mapa do Google, só carrega depois de o visitante aceitar.`],
].map(([t, c]) => `<div class="passo"><h3>${t}</h3><p>${c}</p></div>`).join('')

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
const DESC = `${maiuscula(extenso(N))} sites no ar, em ${extenso(porConcelho.size)} concelhos: oficinas, stands, limpezas, construção e personalização. Rápidos, legais, e o cliente edita sozinho.`

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
<a class="salto" href="#trabalhos">Saltar para os ${extenso(N)} trabalhos</a>

<header class="topo">
 <a class="marca" href="#top"><b>Renato Valente</b></a>
 <nav aria-label="Secções">
  <a href="#onde">Onde</a><a href="#trabalhos">Trabalhos</a><a href="#metodo">Como trabalho</a><a href="#contacto">Contacto</a>
 </nav>
 <p class="topo-n"><b>${N}</b> no ar</p>
 ${TEL ? `<a class="topo-tel" href="tel:${esc(TEL)}">Ligar ${esc(TEL_TXT)}</a>` : ''}
</header>
<div class="fita" id="fita" aria-hidden="true">${fita}</div>

<main id="top">

<section class="cabeca">
 <p class="kicker">Portefólio · ${hoje.getFullYear()} · sites para empresas portuguesas</p>
 <h1>Faço sites para empresas portuguesas.<br><em>${maiuscula(extenso(N))} estão no ar.</em></h1>
 <p class="lead">Desenho, construo e ponho no ar — do primeiro esboço ao domínio. Carregam depressa, funcionam no telemóvel e não pagam mensalidades de plataforma.</p>
 <div class="contadores">${contadores}</div>
 <p class="botoes">${botoes.join('')}</p>
 ${TEL ? '<p class="micro">(chamada para a rede móvel nacional)</p>' : ''}
 <p class="charneira"><a href="#onde">Diga-me onde fica o seu negócio e eu digo-lhe quais destes ${extenso(N)} ficam mais perto <span aria-hidden="true">↓</span></a></p>
</section>

<section id="onde" class="onde">
 <div class="onde-txt">
  <p class="kicker">O compasso</p>
  <h2>Onde fica o seu negócio?</h2>
  <p class="lead">Escreva o seu concelho. A página mede a distância a cada um dos ${extenso(N)} trabalhos e reordena-os, do mais perto para o mais longe.</p>
  <form id="compasso" novalidate>
   <label for="concelho">O seu concelho</label>
   <span class="campo">
    <input id="concelho" name="concelho" list="l-concelhos" autocomplete="off" spellcheck="false"
           enterkeyhint="done" inputmode="text" placeholder="por exemplo, Ovar">
    <datalist id="l-concelhos"></datalist>
   </span>
   <button type="submit">Medir</button>
   <button type="button" id="limpar" hidden>Limpar</button>
  </form>
  <p id="medida" role="status" aria-live="polite"></p>
  <noscript><p class="nota">A medição precisa de JavaScript. A lista completa dos ${extenso(N)} trabalhos está logo abaixo, do norte para o sul.</p></noscript>
  <p class="onde-nota">As distâncias são medidas entre os centros dos concelhos, em linha recta.</p>
 </div>
 <figure class="mapa">
  <div class="mapa-caixa">
   <img src="assets/mapa.svg" width="${VB[2]}" height="${VB[3]}" loading="lazy" decoding="async"
        alt="Mapa administrativo de Portugal continental com os ${extenso(porConcelho.size)} concelhos onde há trabalhos assinalados: ${concelhosOrd.map(([n, q]) => `${n} (${q})`).join(', ')}.">
   ${svgSobreposto}
  </div>
  <figcaption>Portugal continental, ${mapa.concelhos.length} concelhos. Assinalados, os ${extenso(porConcelho.size)} onde há trabalho feito — em faixas, quando há mais do que um. Fronteiras da Carta Administrativa Oficial de Portugal.</figcaption>
 </figure>
</section>

<section id="trabalhos" class="trabalhos">
 <div class="controlos">
  <h2>Os ${extenso(N)} trabalhos</h2>
  <div class="chips" role="group" aria-label="Filtrar por sector">${chips}</div>
  <div class="chips chips--2" id="legenda" role="group" aria-label="Filtrar por concelho">${chipsConcelho}</div>
  <p class="resultado" id="resultado" aria-live="polite"><b>${N}</b> trabalhos, do norte para o sul</p>
 </div>
 <div class="grelha" id="grelha">${ordenados.map(ficha).join('\n')}</div>
 <p class="vazio" id="vazio" hidden></p>
</section>

<section id="metodo" class="metodo">
 <p class="kicker">Como trabalho</p>
 <h2>Quatro coisas que ficam sempre feitas</h2>
 <div class="passos">${metodo}</div>
 ${PRECO && PRAZO ? `<p class="preco"><b>Quanto custa e quanto demora</b> — a partir de ${esc(PRECO)} e ${esc(PRAZO)} semanas, com o domínio e o primeiro ano incluídos.</p>` : ''}
</section>

<section id="area" class="area">
 <p class="kicker">Para quem é da área</p>
 <h2>O que está por baixo</h2>
 <div class="area-grade">
  <dl>
   <dt>Alojamento</dt><dd>${N}/${N} em GitHub Pages. Zero servidores, zero mensalidades.</dd>
   <dt>Geradores próprios</dt><dd>${nGerador} sites construídos por gerador escrito para o efeito (Node e Python), sem dependências de runtime.</dd>
   <dt>Backoffice</dt><dd>${nBackoffice} com Pages CMS: o cliente edita JSON e Markdown por interface, o commit dispara a reconstrução.</dd>
   <dt>Multilingue</dt><dd>${nMulti}: ${trabalhos.filter(t => (t.linguas || 1) > 1).map(t => `${esc(t.nome)} (${t.linguas})`).join(', ')}.</dd>
   <dt>Loja online</dt><dd>${nLoja}: Armazém dos Pneus, com Cloudflare Worker, Stripe, KV e Resend.</dd>
   <dt>Frameworks</dt><dd>${N - trabalhos.filter(t => (t.tech || []).some(x => /Astro|Angular/.test(x))).length} dos ${N} sem framework. As excepções: Astro 5 (Marmovar) e Angular 21 pré-renderizado (WeldStaff).</dd>
  </dl>
  <div class="area-notas">
   <h3>Três em detalhe</h3>
   <p><b>Praiómetro</b> — 1131 praias, lagoas e piscinas naturais com previsão de hora a hora. Modelo HCI:Beach recalibrado para o Atlântico português, PWA com service worker, contas e favoritos em Supabase, dados do Open-Meteo. Bateria de testes de browser a correr no CI.</p>
   <p><b>Armazém dos Pneus</b> — loja completa sobre alojamento estático: catálogo em JSON, carrinho no cliente, e um Cloudflare Worker a fazer o pagamento (Stripe), o email de confirmação (Resend) e o registo da encomenda (KV). Sem servidor a pagar ao mês.</p>
   <p><b>WeldStaff</b> — migração de Angular em Docker num VPS para Angular 21 pré-renderizado no GitHub Pages: seis rotas em HTML servido, i18n em quatro línguas com Transloco, formulário validado por Worker. A conta do alojamento passou a zero.</p>
  </div>
 </div>
</section>

<section class="censo">
 <p class="kicker">Censo cromático</p>
 <h2>As ${extenso(N, true)} cores</h2>
 <div class="censo-fita" aria-hidden="true">${censoFita}</div>
 <p class="censo-frase">${censoFrase}</p>
 <details>
  <summary>Ver as ${extenso(N, true)} cores em tabela</summary>
  <table><caption>Cor de marca de cada trabalho, por matiz crescente.</caption>
   <thead><tr><th scope="col">Trabalho</th><th scope="col">Cor</th><th scope="col">Matiz</th><th scope="col">Família</th></tr></thead>
   <tbody>${censoTabela}</tbody></table>
 </details>
</section>

<section id="contacto" class="contacto">
 <h2>Falar comigo</h2>
 ${SEM_CONTACTO
   ? `<p class="lead">Os contactos ainda não estão publicados nesta página.</p>`
   : `<p class="lead">Diga-me o que faz e em que concelho, e eu digo-lhe o que dá para fazer.</p>
      <p class="botoes">${botoes.join('')}</p>
      ${TEL ? '<p class="micro">(chamada para a rede móvel nacional)</p>' : ''}`}
</section>

</main>

<footer class="rodape">
 <div class="rod-1">
  <p><b>Renato Valente</b>${autor.nif ? ` · NIF ${esc(autor.nif)}` : ''}${autor.morada ? ` · ${esc(autor.morada)}` : ''}</p>
  ${MAIL ? `<p><a href="mailto:${esc(MAIL)}">${esc(MAIL)}</a></p>` : ''}
  ${autor.github ? `<p><a href="${esc(autor.github)}" target="_blank" rel="noopener">${esc(autor.github.replace(/^https:\/\//, ''))}</a></p>` : ''}
 </div>
 <div class="rod-2">
  <p>Capturas reais dos ${extenso(N)} sites em produção, tiradas a ${capturadoEm.split('-').reverse().join('/')}.</p>
  <p>Sem cookies, sem rastreio, sem terceiros — nem o mapa é do Google: é desenhado aqui, a partir da Carta Administrativa Oficial de Portugal.</p>
  <p>Composto em Schibsted Grotesk e IBM Plex Mono, ambas auto-alojadas. Página gerada a ${DATA_PT}.</p>
 </div>
</footer>

${botoes.length && (TEL || WA) ? `<div class="accao">
 ${TEL ? `<a href="tel:${esc(TEL)}">Ligar</a>` : ''}
 ${WA ? `<a href="https://wa.me/${esc(WA)}" target="_blank" rel="noopener">WhatsApp</a>` : ''}
</div>` : ''}

<script src="assets/portfolio.js" defer></script>
</body>
</html>
`

// resolver __BASE__ a partir do CNAME, se existir
const cname = existsSync(join(RAIZ, 'CNAME')) ? readFileSync(join(RAIZ, 'CNAME'), 'utf8').trim() : ''
const BASE = cname ? `https://${cname}` : 'https://renatovalente5.github.io/Portfolio'
writeFileSync(join(RAIZ, 'index.html'),
  html.replaceAll('__BASE__', BASE).replace('__GRAD__', gradientes.join('')))

// dados que o JS precisa em runtime, gerados aqui para não haver números à mão
writeFileSync(join(RAIZ, 'data/trabalhos-min.json'), JSON.stringify(
  ordenados.map(t => ({ id: t.id, nome: t.nome, concelho: t.concelho, localidade: t.localidade,
                        lat: t.lat, lon: t.lon, sector: t.sector }))))

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
  if (!semDados.includes(extenso(N))) aviso(`o número de trabalhos (${extenso(N)}) não aparece por extenso no HTML`)
}

console.log(`\n  ${N} trabalhos · ${porConcelho.size} concelhos · ${nDominio} com .pt · ${nBackoffice} com backoffice`)
console.log(`  sectores: ${sectoresOrd.map(([, v]) => `${v.nome} ${v.n}`).join(' · ')}`)
console.log(`  censo:    ${famOrd.map(([f, ts]) => `${f} ${ts.length}`).join(' · ')}`)
console.log(`\n  index.html ${kb(htmlB)} · mapa.svg ${kb(mapaB)} · css ${kb(cssB)} · js ${kb(jsB)}`)
console.log(`  concelhos.json ${kb(tam('data/concelhos.json'))} (só carregado quando o Compasso é usado)`)

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
