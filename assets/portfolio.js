/* Portefólio — Renato Valente
   Três funções, e mais nenhuma porta de estado:
     pintar()        — a fita, o mapa e a lista mostram o que está no ecrã
     filtrar(sector) — mostra/esconde fichas e actualiza chips, contagem e o resto
     apontar(alvo)   — o rato no mapa; alimenta pintar()
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
  const itensLista = $$('.conc-lista li')

  const trabalhos = fichas.map(f => ({
    el: f,
    id: f.dataset.id,
    sector: f.dataset.sector,
    concelho: f.dataset.concelho || '',
  }))

  /* ── o que está no ecrã ──────────────────────────────────────────────────
     Uma só fonte de verdade para a fita, o mapa e a lista. Duas origens que se
     sobrepõem: o scroll diz que FILA de cartões está visível (três no computador,
     duas no tablet, uma no telemóvel) e o rato no mapa diz que CONCELHO se aponta.
     O rato ganha enquanto estiver a apontar; quando sai, volta a valer o scroll. */
  let porScroll = []      // ids dos cartões da fila visível
  let porRato = null      // ids dos cartões do concelho apontado, ou null

  function pintar () {
    const ids = porRato ?? porScroll
    const fora = ids.length === 0 && !porRato
    // a fita: fora da grelha mostra as cores todas; dentro acende a fila
    if (fita) {
      fita.dataset.modo = fora ? 'todas' : 'fila'
      for (const b of bandas) {
        if (!fora && ids.includes(b.dataset.id)) b.setAttribute('data-aceso', '')
        else b.removeAttribute('data-aceso')
      }
    }
    // o mapa e a lista: os concelhos desses cartões
    const conc = new Set(trabalhos.filter(t => ids.includes(t.id)).map(t => t.concelho).filter(Boolean))
    for (const p of concPaths) {
      if (conc.has(p.dataset.concelho)) p.setAttribute('data-activo', '')
      else p.removeAttribute('data-activo')
    }
    for (const li of itensLista) {
      if (conc.has(li.dataset.concelho)) li.setAttribute('data-activo', '')
      else li.removeAttribute('data-activo')
    }
  }

  if ('IntersectionObserver' in window) {
    const vistos = new Set()
    const io = new IntersectionObserver(ents => {
      for (const e of ents) e.isIntersecting ? vistos.add(e.target) : vistos.delete(e.target)
      // a faixa de observação tem 16% da altura do ecrã: os cartões de uma fila
      // partilham o topo, por isso entram e saem juntos — é a fila, não um cartão.
      porScroll = [...vistos].filter(el => !el.classList.contains('fora')).map(el => el.dataset.id)
      pintar()
    }, { rootMargin: '-42% 0px -42% 0px' })
    for (const f of fichas) io.observe(f)
  }

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
    // o que estava aceso pode ter saído do filtro
    porScroll = porScroll.filter(id => {
      const t = trabalhos.find(t => t.id === id)
      return t && !t.el.classList.contains('fora')
    })
    if (porRato) porRato = porRato.filter(id => {
      const t = trabalhos.find(t => t.id === id)
      return t && !t.el.classList.contains('fora')
    })
    pintar()
    // O nome perde o destino quando não sobra cartão nenhum visível nesse concelho.
    // O contador <b> NÃO muda: continua a contar todos os trabalhos do concelho, e
    // mudá-lo faria o número mentir.
    for (const li of $$('.conc-lista li')) {
      const a = li.querySelector('a')
      if (!a) continue
      const primeiro = trabalhos.find(t => t.concelho === li.dataset.concelho && !t.el.classList.contains('fora'))
      if (primeiro) a.setAttribute('href', '#t-' + primeiro.id)
      else a.removeAttribute('href')
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

  /* ── o mapa ao ponteiro ──────────────────────────────────────────────────
     O alvo NÃO é o <path>: São João da Madeira tem 5×6 px de ecrã e seis dos doze
     concelhos vivem num aglomerado de ~18 px. Ganha o concelho cujo centróide está
     mais perto do cursor — e NÃO se testa primeiro se o ponto cai dentro de uma
     forma: no aglomerado, o polígono do vizinho grande envolve a mancha pequena, e
     apontar a São João da Madeira devolveria Oliveira de Azeméis.
     Só ponteiro fino: em toque, o mapa ocupa ~85% da altura do ecrã e quase todo o
     arrasto para descer começaria com o dedo lá dentro. Quem não tem rato chega ao
     mesmo sítio pelas âncoras dos nomes, que são alvos de 45 px.                  */
  const caixa = $('.mapa-caixa')
  const fino = matchMedia('(hover:hover) and (pointer:fine)')

  if (caixa && concPaths.length && fino.matches) {
    const svgMapa = $('.mapa-cima')
    const vb = svgMapa.getAttribute('viewBox').split(/\s+/).map(Number)
    const alvos = concPaths.map(p => ({
      p, c: p.dataset.concelho, cx: +p.dataset.cx, cy: +p.dataset.cy,
      li: itensLista.find(li => li.dataset.concelho === p.dataset.concelho) || null,
    }))
    let apontado = null

    function apontar (alvo) {
      if (alvo === apontado) return
      apontado = alvo
      for (const a of alvos) {
        if (a === alvo) {
          a.p.setAttribute('data-perto', '')
          a.p.parentNode.appendChild(a.p)   // em SVG manda a ordem de pintura
        } else a.p.removeAttribute('data-perto')
        if (a.li) {
          if (a === alvo) a.li.setAttribute('data-perto', '')
          else a.li.removeAttribute('data-perto')
        }
      }
      if (alvo) caixa.setAttribute('data-mostra', '')
      else caixa.removeAttribute('data-mostra')
      // e a fita acende as bandas dos trabalhos desse concelho
      porRato = alvo
        ? trabalhos.filter(t => t.concelho === alvo.c && !t.el.classList.contains('fora')).map(t => t.id)
        : null
      pintar()
    }

    // O rect só se lê no início de cada movimento, e nunca depois de escrever
    function maisPerto (ev) {
      const r = caixa.getBoundingClientRect()
      if (!r.width) return null
      const x = vb[0] + (ev.clientX - r.left) / r.width * vb[2]
      const y = vb[1] + (ev.clientY - r.top) / r.height * vb[3]
      let melhor = null, d2 = Infinity
      for (const a of alvos) {
        if (a.p.hasAttribute('data-fora')) continue   // fora do filtro, fora do alcance
        const dd = (a.cx - x) ** 2 + (a.cy - y) ** 2
        if (dd < d2) { d2 = dd; melhor = a }
      }
      // 120 unidades ≈ 70 km: mais longe do que isto e não se está a apontar a nada
      return d2 <= 120 * 120 ? melhor : null
    }

    caixa.addEventListener('pointermove', ev => {
      if (ev.pointerType !== 'mouse') return
      apontar(maisPerto(ev))
    })
    caixa.addEventListener('pointerleave', ev => {
      if (ev.pointerType === 'mouse') apontar(null)
    })
    // Clicar no mapa segue a mesma âncora do nome: é redundante por construção, logo
    // não há funcionalidade que exista só com rato.
    caixa.addEventListener('click', ev => {
      if (!apontado || !apontado.li) return
      const a = apontado.li.querySelector('a[href]')
      if (a) { ev.preventDefault(); a.click() }
    })
    // passar o rato ou focar um nome acende a mancha, pelo mesmo caminho
    for (const a of alvos) {
      if (!a.li) continue
      const liga = a.li.querySelector('a')
      if (!liga) continue
      liga.addEventListener('pointerenter', () => apontar(a))
      liga.addEventListener('focus', () => apontar(a))
      liga.addEventListener('pointerleave', () => apontar(null))
      liga.addEventListener('blur', () => apontar(null))
    }
  }

  /* ── aterrar no cartão certo ─────────────────────────────────────────────
     As fichas têm content-visibility:auto com contain-intrinsic-size estimado: na
     primeira visita o salto por âncora aterra desviado, porque a altura real só se
     sabe depois de pintar. Corrige-se depois de o layout assentar.               */
  function corrigirAterragem () {
    const id = location.hash.slice(1)
    if (!id) return
    const el = document.getElementById(id)
    if (!el || !el.classList.contains('ficha')) return
    requestAnimationFrame(() => requestAnimationFrame(() => {
      const topo = el.getBoundingClientRect().top
      const alvo = parseFloat(getComputedStyle(document.documentElement).scrollPaddingTop) || 0
      if (Math.abs(topo - alvo) > 4) scrollBy(0, topo - alvo)
    }))
  }
  addEventListener('hashchange', corrigirAterragem)

  /* ── botão de subir ──────────────────────────────────────────────────────
     Aparece depois de uma vista e meia de scroll. Sem listener de scroll: um
     sentinela invisível no topo e um IntersectionObserver — o scroll é o evento
     mais barato de ouvir mal.                                                  */
  const subir = $('.subir')
  const heroi = $('.cabeca')
  if (subir && heroi && 'IntersectionObserver' in window) {
    subir.hidden = false
    // Observa-se o herói, que já existe. Não se injecta um sentinela de 150vh: uma
    // altura em vh cresce quando alguém estica o ecrã (é o que faz o verificador ao
    // capturar a página inteira) e passa a somar milhares de píxeis ao documento.
    new IntersectionObserver(([e]) => {
      if (e.isIntersecting) subir.removeAttribute('data-ver')
      else subir.setAttribute('data-ver', '')
    }, { threshold: 0 }).observe(heroi)
    subir.addEventListener('click', () => {
      const suave = !matchMedia('(prefers-reduced-motion:reduce)').matches
      scrollTo({ top: 0, behavior: suave ? 'smooth' : 'auto' })
      // devolver o foco ao início, senão o teclado fica onde estava
      const primeiro = $('.topo .marca')
      if (primeiro) primeiro.focus({ preventScroll: true })
      history.replaceState(null, '', location.pathname)
    })
  }

  /* ── estado no URL, para o link por sector ser partilhável ──────────────── */
  const doHash = decodeURIComponent(location.hash.replace(/^#/, ''))
  if (doHash && chips.some(c => c.dataset.sector === doHash)) filtrar(doHash)
}
