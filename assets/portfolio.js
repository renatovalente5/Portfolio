/* Portefólio — Renato Valente
   Três funções, e mais nenhuma porta de estado: rato, dedo, teclado e scroll
   chamam sempre uma destas.
     medir(concelho)   — distâncias, reordenação, frase, arcos, hash
     filtrar({...})    — sector × concelho
     activar(id)       — fita + ponto no mapa, ligados ao scroll
   Sem dependências, sem listeners de scroll, sem requestAnimationFrame. */
'use strict'

const $ = s => document.querySelector(s)
const $$ = s => [...document.querySelectorAll(s)]
const semAcentos = s => s.normalize('NFD').replace(/\p{Diacritic}/gu, '')
const chave = s => semAcentos(String(s || '')).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
const slug = s => semAcentos(String(s || '')).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')

const grelha = $('#grelha')
if (grelha) {
  const fichas = $$('.ficha')
  const ordemBase = fichas.map(f => f.dataset.id)
  const fita = $('#fita')
  const bandas = fita ? [...fita.children] : []
  const mapaSvg = $('.mapa-cima')
  const concPaths = mapaSvg ? [...mapaSvg.querySelectorAll('.conc path')] : []
  const gCompasso = mapaSvg ? mapaSvg.querySelector('.compasso') : null
  const elMedida = $('#medida')
  const elResultado = $('#resultado')
  const elVazio = $('#vazio')
  const form = $('#compasso')
  const input = $('#concelho')
  const lista = $('#l-concelhos')
  const btLimpar = $('#limpar')

  // geometria do mapa, tal como o gerador a calculou (equirectangular)
  const geo = (() => {
    if (!mapaSvg) return null
    const vb = mapaSvg.getAttribute('viewBox').split(/\s+/).map(Number)
    return { w: vb[2], h: vb[3] }
  })()
  // os mesmos valores do build (_source/dados/mapa-continente.json)
  const PROJ = { lon0: -8.60, cosl: Math.cos(39.6 * Math.PI / 180) }
  let calib = null   // {ax, bx, ay, by, kkm} resolvido dos concelhos conhecidos

  const trabalhos = fichas.map(f => ({
    el: f,
    id: f.dataset.id,
    nome: f.querySelector('h3').textContent.replace(/ — abre.*/, '').trim(),
    sector: f.dataset.sector,
    concelho: f.dataset.concelho || '',
    concelhoNome: (f.querySelector('.meta')?.textContent || '').split('·')[1]?.split(',').pop()?.trim() || '',
    lat: f.dataset.lat ? +f.dataset.lat : null,
    lon: f.dataset.lon ? +f.dataset.lon : null,
    km: null,
  }))

  /* ── calibrar a projecção a partir dos concelhos desenhados ────────────── */
  // Cada <path> tem o bbox real; o centróide do concelho está nos data-* das fichas.
  // Duas referências bastam para resolver escala e deslocamento em cada eixo.
  function calibrar () {
    if (calib || !concPaths.length) return calib
    const refs = []
    for (const p of concPaths) {
      const s = p.dataset.concelho
      const t = trabalhos.find(t => t.concelho === s && t.lat != null)
      if (!t) continue
      let bb; try { bb = p.getBBox() } catch { return null }
      if (!bb || !bb.width) return null
      refs.push({ x: bb.x + bb.width / 2, y: bb.y + bb.height / 2, lat: t.lat, lon: t.lon })
    }
    if (refs.length < 2) return null
    // usa os dois mais afastados em cada eixo, para minimizar o erro
    const px = refs.map(r => ({ u: (r.lon - PROJ.lon0) * PROJ.cosl, v: r.x })).sort((a, b) => a.u - b.u)
    const py = refs.map(r => ({ u: r.lat, v: r.y })).sort((a, b) => a.u - b.u)
    const ax = (px.at(-1).v - px[0].v) / (px.at(-1).u - px[0].u)
    const bx = px[0].v - ax * px[0].u
    const ay = (py.at(-1).v - py[0].v) / (py.at(-1).u - py[0].u)
    const by = py[0].v - ay * py[0].u
    if (!isFinite(ax) || !isFinite(ay) || !ay) return null
    calib = { ax, bx, ay, by, kkm: Math.abs(ay) / 111.32 }
    return calib
  }
  const paraSvg = (lat, lon) => {
    const c = calib || calibrar()
    if (!c) return null
    return { x: c.ax * ((lon - PROJ.lon0) * PROJ.cosl) + c.bx, y: c.ay * lat + c.by }
  }

  // Raios do compasso, em km. Num mapa do país inteiro, 25 km é um círculo de 4%
  // da altura: invisível. 50 e 100 km lêem-se, e são as distâncias que interessam.
  const ARCO_A = 50, ARCO_B = 100

  /* ── haversine ─────────────────────────────────────────────────────────── */
  function haversine (a, b, c, d) {
    const R = 6371, r = Math.PI / 180
    const dLat = (c - a) * r, dLon = (d - b) * r
    const s = Math.sin(dLat / 2) ** 2 +
      Math.cos(a * r) * Math.cos(c * r) * Math.sin(dLon / 2) ** 2
    return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)))
  }

  /* ── 308 concelhos, carregados só quando fazem falta ───────────────────── */
  let pConcelhos = null
  let idx = null
  function carregarConcelhos () {
    if (pConcelhos) return pConcelhos
    pConcelhos = fetch('data/concelhos.json')
      .then(r => { if (!r.ok) throw new Error(r.status); return r.json() })
      .then(arr => {
        idx = new Map()
        const frag = document.createDocumentFragment()
        for (const [nome, lat, lon] of arr) {
          idx.set(chave(nome), { nome, lat, lon })
          const o = document.createElement('option')
          o.value = nome
          frag.appendChild(o)
        }
        if (lista) lista.appendChild(frag)
        return idx
      })
      .catch(e => { pConcelhos = null; throw e })
    return pConcelhos
  }
  if (form) {
    form.addEventListener('focusin', carregarConcelhos, { once: true })
    const ocioso = window.requestIdleCallback || (f => setTimeout(f, 1600))
    addEventListener('load', () => ocioso(() => carregarConcelhos().catch(() => {})), { once: true })
  }

  /* ── medir ─────────────────────────────────────────────────────────────── */
  let origem = null

  function ordemActual () {
    return origem
      ? [...trabalhos].sort((a, b) =>
          (a.km == null) - (b.km == null) || (a.km - b.km) || a.nome.localeCompare(b.nome, 'pt'))
      : ordemBase.map(id => trabalhos.find(t => t.id === id))
  }

  function reordenar () {
    const focado = document.activeElement
    const idFocado = focado && focado.closest ? focado.closest('.ficha')?.dataset.id : null
    const frag = document.createDocumentFragment()
    for (const t of ordemActual()) frag.appendChild(t.el)
    grelha.appendChild(frag)
    // a fita é sempre regenerada da mesma lista dos cartões: a posição nunca mente
    if (fita) {
      const f2 = document.createDocumentFragment()
      for (const t of ordemActual()) {
        const b = bandas.find(b => b.dataset.id === t.id)
        if (b) f2.appendChild(b)
      }
      fita.appendChild(f2)
    }
    if (idFocado) {
      const a = grelha.querySelector(`.ficha[data-id="${idFocado}"] h3 a`)
      if (a && focado !== document.body) a.focus({ preventScroll: true })
    }
  }

  const mostrarCompasso = m => m ? gCompasso.removeAttribute('hidden') : gCompasso.setAttribute('hidden', '')

  function desenharCompasso () {
    if (!gCompasso || !origem) return
    const p = paraSvg(origem.lat, origem.lon)
    if (!p) { mostrarCompasso(false); return }
    const c = calib
    mostrarCompasso(true)
    const eu = gCompasso.querySelector('.eu')
    eu.setAttribute('transform', `translate(${p.x.toFixed(1)},${p.y.toFixed(1)})`)
    for (const [id, km] of [['arco25', ARCO_A], ['arco50', ARCO_B]]) {
      const el = gCompasso.querySelector('#' + id)
      el.setAttribute('cx', p.x.toFixed(1))
      el.setAttribute('cy', p.y.toFixed(1))
      el.setAttribute('r', (km * c.kkm).toFixed(1))
    }
    const perto = ordemActual().find(t => t.km != null && t.lat != null)
    const guia = gCompasso.querySelector('.guia')
    const q = perto ? paraSvg(perto.lat, perto.lon) : null
    if (q) {
      guia.setAttribute('x1', p.x.toFixed(1)); guia.setAttribute('y1', p.y.toFixed(1))
      guia.setAttribute('x2', q.x.toFixed(1)); guia.setAttribute('y2', q.y.toFixed(1))
      guia.removeAttribute('hidden')
    } else guia.setAttribute('hidden', '')
  }

  function frase () {
    if (!elMedida) return
    if (!origem) { elMedida.textContent = ''; elMedida.classList.remove('erro'); return }
    const ord = ordemActual().filter(t => t.km != null)
    if (!ord.length) { elMedida.textContent = ''; return }
    const p = ord[0]
    const a25 = ord.filter(t => t.km <= ARCO_A).length
    const a50 = ord.filter(t => t.km <= ARCO_B).length
    const dist = p.km < 1 ? 'no seu próprio concelho' : `a <b>${p.km}</b> km`
    let s = `A partir de <strong>${origem.nome}</strong>: o mais perto é o ` +
      `<strong>${p.nome}</strong>` +
      (p.concelhoNome && p.concelhoNome !== origem.nome && p.km >= 1 ? `, em ${p.concelhoNome},` : ',') +
      ` ${dist}.`
    const frases = []
    if (a25) frases.push(`<b>${a25}</b> ${a25 === 1 ? 'fica' : 'ficam'} a menos de ${ARCO_A} km`)
    if (a50 > a25) frases.push(`<b>${a50}</b> a menos de ${ARCO_B} km`)
    if (frases.length) s += ' ' + frases.join(' e ') + '.'
    elMedida.innerHTML = s.replace(/\s+\./g, '.')
    elMedida.classList.remove('erro')
  }

  function medir (nome) {
    if (!idx) return
    const c = idx.get(chave(nome))
    if (!c) {
      origem = null
      for (const t of trabalhos) t.km = null
      if (elMedida) {
        elMedida.textContent = 'Não encontrei esse concelho. Escreva o nome do concelho — por exemplo, Ovar.'
        elMedida.classList.add('erro')
      }
      return
    }
    origem = c
    for (const t of trabalhos) {
      t.km = t.lat == null ? null : Math.round(haversine(c.lat, c.lon, t.lat, t.lon))
    }
    for (const t of trabalhos) {
      const el = t.el.querySelector('.km')
      if (!el) continue
      if (t.km == null) { el.hidden = true; el.textContent = '' } else {
        el.textContent = t.km < 1 ? `no seu concelho` : `${t.km} km de ${c.nome}`
        el.hidden = false
      }
    }
    reordenar()
    frase()
    desenharCompasso()
    // chips de concelho: cada um ganha a distância, e reordenam-se pela mesma medida
    const legenda = $('#legenda')
    if (legenda) {
      const bt = [...legenda.children]
      for (const b of bt) {
        const t = trabalhos.find(t => t.concelho === b.dataset.concelho && t.km != null)
        const cd = b.querySelector('.cd')
        if (t) { cd.textContent = ` · ${t.km} km`; cd.hidden = false } else { cd.hidden = true }
        b.dataset.km = t ? t.km : 99999
      }
      const f = document.createDocumentFragment()
      for (const b of bt.sort((a, b) => +a.dataset.km - +b.dataset.km)) f.appendChild(b)
      legenda.appendChild(f)
    }
    if (btLimpar) btLimpar.hidden = false
    contar()
    hash()
  }

  function limpar () {
    origem = null
    for (const t of trabalhos) {
      t.km = null
      const el = t.el.querySelector('.km')
      if (el) { el.hidden = true; el.textContent = '' }
    }
    $$('#legenda .cd').forEach(e => { e.hidden = true })
    const legenda = $('#legenda')
    if (legenda) {
      const f = document.createDocumentFragment()
      for (const b of [...legenda.children].sort((a, b) =>
        +b.dataset.n - +a.dataset.n || a.textContent.localeCompare(b.textContent, 'pt'))) f.appendChild(b)
      legenda.appendChild(f)
    }
    if (gCompasso) mostrarCompasso(false)
    if (input) input.value = ''
    if (btLimpar) btLimpar.hidden = true
    reordenar(); frase(); contar(); hash()
  }

  if (form) {
    form.addEventListener('submit', e => {
      e.preventDefault()
      const v = input.value.trim()
      if (!v) { limpar(); return }
      carregarConcelhos().then(() => medir(v)).catch(() => {
        if (elMedida) {
          elMedida.textContent = 'Não consegui carregar a lista de concelhos. A lista completa dos trabalhos está abaixo.'
          elMedida.classList.add('erro')
        }
      })
    })
    // escolher no datalist mede logo, sem ter de carregar em Medir
    input.addEventListener('input', () => {
      if (!idx) return
      if (idx.has(chave(input.value))) medir(input.value)
    })
    if (btLimpar) btLimpar.addEventListener('click', limpar)
  }

  /* ── filtrar ───────────────────────────────────────────────────────────── */
  let filtro = { sector: '', concelho: '' }

  function contar () {
    const dentro = trabalhos.filter(t => !t.el.classList.contains('fora'))
    const n = dentro.length
    if (elResultado) {
      const partes = []
      const s = filtro.sector
        ? [...$$('.chip:not(.chip--c)')].find(c => c.dataset.sector === filtro.sector)?.textContent.replace(/\s*\d+\s*$/, '').trim()
        : null
      if (s) partes.push(s)
      if (filtro.concelho) {
        const b = $(`#legenda [data-concelho="${filtro.concelho}"]`)
        if (b) partes.push(b.textContent.replace(/\s*\d+.*$/, '').trim())
      }
      partes.push(origem ? `do mais perto ao mais longe de ${origem.nome}` : 'do norte para o sul')
      elResultado.innerHTML = `<b>${n}</b> ${n === 1 ? 'trabalho' : 'trabalhos'} · ${partes.join(' · ')}`
    }
    if (elVazio) {
      if (n === 0) {
        elVazio.hidden = false
        elVazio.textContent = 'Nenhum trabalho corresponde a estes dois filtros ao mesmo tempo. Carregue outra vez para os desligar.'
      } else elVazio.hidden = true
    }
    // a fita mostra o que está dentro do filtro
    for (const b of bandas) {
      const t = trabalhos.find(t => t.id === b.dataset.id)
      if (t && t.el.classList.contains('fora')) b.dataset.fora = ''
      else delete b.dataset.fora
    }
    for (const p of concPaths) {
      const tem = trabalhos.some(t => t.concelho === p.dataset.concelho && !t.el.classList.contains('fora'))
      if (tem) delete p.dataset.fora
      else p.dataset.fora = ''
    }
  }

  function filtrar (novo) {
    filtro = { ...filtro, ...novo }
    for (const t of trabalhos) {
      const ok = (!filtro.sector || t.sector === filtro.sector) &&
                 (!filtro.concelho || t.concelho === filtro.concelho)
      t.el.classList.toggle('fora', !ok)
      if (ok) t.el.removeAttribute('inert'); else t.el.setAttribute('inert', '')
    }
    for (const c of $$('.chip:not(.chip--c)')) c.setAttribute('aria-pressed', String((c.dataset.sector || '') === filtro.sector))
    for (const b of $$('#legenda .chip')) b.setAttribute('aria-pressed', String(b.dataset.concelho === filtro.concelho))
    contar()
    hash()
  }

  for (const c of $$('.chip:not(.chip--c)')) {
    c.addEventListener('click', () => {
      const s = c.dataset.sector || ''
      filtrar({ sector: s === filtro.sector ? '' : s })
      $('#trabalhos').scrollIntoView({ block: 'start' })
    })
  }
  for (const b of $$('#legenda .chip')) {
    b.addEventListener('click', () => {
      const s = b.dataset.concelho
      filtrar({ concelho: s === filtro.concelho ? '' : s })
      $('#trabalhos').scrollIntoView({ block: 'start' })
    })
  }

  /* ── activar: liga o scroll à fita e ao mapa ────────────────────────────── */
  function activar (id) {
    for (const b of bandas) (b.dataset.id === id) ? b.setAttribute('data-activo', '') : b.removeAttribute('data-activo')
    const t = trabalhos.find(t => t.id === id)
    for (const p of concPaths) {
      (t && p.dataset.concelho === t.concelho) ? p.setAttribute('data-activo', '') : p.removeAttribute('data-activo')
    }
  }
  if ('IntersectionObserver' in window) {
    const vistos = new Set()
    const io = new IntersectionObserver(ents => {
      for (const e of ents) e.isIntersecting ? vistos.add(e.target) : vistos.delete(e.target)
      if (!vistos.size) return
      // o mais próximo do centro do ecrã manda
      const meio = innerHeight / 2
      let melhor = null, d = Infinity
      for (const el of vistos) {
        const r = el.getBoundingClientRect()
        const dd = Math.abs(r.top + r.height / 2 - meio)
        if (dd < d) { d = dd; melhor = el }
      }
      if (melhor) activar(melhor.dataset.id)
    }, { rootMargin: '-42% 0px -42% 0px' })
    for (const f of fichas) io.observe(f)
  }

  /* ── estado no URL, para o link ser partilhável ─────────────────────────── */
  let aEscrever = false
  function hash () {
    if (aEscrever) return
    const p = []
    if (filtro.sector) p.push(filtro.sector)
    if (filtro.concelho) p.push('concelho=' + filtro.concelho)
    if (origem) p.push('de=' + slug(origem.nome))
    const h = p.length ? '#' + p.join('&') : location.pathname
    history.replaceState(null, '', h)
  }
  function lerHash () {
    const h = decodeURIComponent(location.hash.replace(/^#/, ''))
    if (!h) return
    const partes = h.split('&')
    const novo = { sector: '', concelho: '' }
    let de = null
    for (const p of partes) {
      if (p.startsWith('concelho=')) novo.concelho = p.slice(9)
      else if (p.startsWith('de=')) de = p.slice(3)
      else if ($$('.chip:not(.chip--c)').some(c => c.dataset.sector === p)) novo.sector = p
    }
    aEscrever = true
    if (novo.sector || novo.concelho) filtrar(novo)
    aEscrever = false
    if (de) {
      carregarConcelhos().then(() => {
        const achado = [...idx.values()].find(c => slug(c.nome) === de)
        if (achado) { input.value = achado.nome; medir(achado.nome) }
      }).catch(() => {})
    }
  }
  addEventListener('DOMContentLoaded', lerHash)
  if (document.readyState !== 'loading') lerHash()
}
