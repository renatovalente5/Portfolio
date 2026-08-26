/* Portefólio — Renato Valente
   Duas funções, e mais nenhuma porta de estado:
     filtrar(sector) — mostra/esconde fichas e actualiza chips, fita, mapa e contagem
     activar(id)     — liga o scroll à fita e ao concelho no mapa
   Sem dependências, sem listeners de scroll, sem requestAnimationFrame. */
'use strict'

const $ = s => document.querySelector(s)
const $$ = s => [...document.querySelectorAll(s)]

const grelha = $('#grelha')
if (grelha) {
  const fichas = $$('.ficha')
  const fita = $('#fita')
  const bandas = fita ? [...fita.children] : []
  const concPaths = $$('.mapa-cima .conc path')
  const chips = $$('.chip')
  const elResultado = $('#resultado')

  const trabalhos = fichas.map(f => ({
    el: f,
    id: f.dataset.id,
    sector: f.dataset.sector,
    concelho: f.dataset.concelho || '',
  }))

  /* ── filtrar por sector ─────────────────────────────────────────────────── */
  let sector = ''

  function filtrar (novo) {
    sector = novo
    for (const t of trabalhos) {
      const dentro = !sector || t.sector === sector
      // Classe, nunca o atributo hidden: com o CSS a declarar display, o hidden não
      // esconde nada. E inert, para o que está escondido sair da ordem de tabulação.
      t.el.classList.toggle('fora', !dentro)
      dentro ? t.el.removeAttribute('inert') : t.el.setAttribute('inert', '')
    }
    for (const c of chips) c.setAttribute('aria-pressed', String((c.dataset.sector || '') === sector))

    const n = trabalhos.filter(t => !t.el.classList.contains('fora')).length
    if (elResultado) {
      const nome = sector ? chips.find(c => c.dataset.sector === sector)?.dataset.nome : null
      elResultado.textContent = `${n} ${n === 1 ? 'trabalho' : 'trabalhos'}` + (nome ? ` · ${nome}` : '')
    }
    // a fita e o mapa mostram o que está dentro do filtro
    for (const b of bandas) {
      const t = trabalhos.find(t => t.id === b.dataset.id)
      if (t && t.el.classList.contains('fora')) b.setAttribute('data-fora', '')
      else b.removeAttribute('data-fora')
    }
    for (const p of concPaths) {
      const tem = trabalhos.some(t => t.concelho === p.dataset.concelho && !t.el.classList.contains('fora'))
      if (tem) p.removeAttribute('data-fora')
      else p.setAttribute('data-fora', '')
    }
    history.replaceState(null, '', sector ? '#' + sector : location.pathname)
  }

  for (const c of chips) {
    c.addEventListener('click', () => {
      const s = c.dataset.sector || ''
      filtrar(s === sector ? '' : s)
      $('#trabalhos').scrollIntoView({ block: 'start' })
    })
  }

  /* ── activar: o scroll acende a banda da fita e o concelho no mapa ──────── */
  function activar (id) {
    const t = trabalhos.find(t => t.id === id)
    for (const b of bandas) {
      if (b.dataset.id === id) b.setAttribute('data-activo', '')
      else b.removeAttribute('data-activo')
    }
    for (const p of concPaths) {
      if (t && p.dataset.concelho === t.concelho) p.setAttribute('data-activo', '')
      else p.removeAttribute('data-activo')
    }
  }

  if ('IntersectionObserver' in window) {
    const vistos = new Set()
    const io = new IntersectionObserver(ents => {
      for (const e of ents) e.isIntersecting ? vistos.add(e.target) : vistos.delete(e.target)
      if (!vistos.size) return
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

  /* ── estado no URL, para o link por sector ser partilhável ──────────────── */
  const doHash = decodeURIComponent(location.hash.replace(/^#/, ''))
  if (doHash && chips.some(c => c.dataset.sector === doHash)) filtrar(doHash)
}
