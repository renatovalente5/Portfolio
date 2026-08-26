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
    // O mapa NÃO é filtrado: mostra sempre as cores de todas as localizações. É
    // geografia, não é o estado do filtro — e o painel de cada concelho continua a
    // listar todos os trabalhos de lá.
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

  /* ── o mapa: apontar e abrir ──────────────────────────────────────────────
     O alvo NÃO é o <path>: São João da Madeira tem 5×6 px de ecrã e seis dos doze
     concelhos vivem num aglomerado de ~18 px. Ganha o concelho cujo centróide está
     mais perto do cursor ou do dedo — e não se testa se o ponto cai dentro de uma
     forma: no aglomerado, o polígono do vizinho grande envolve a mancha pequena, e
     apontar a São João da Madeira devolveria Oliveira de Azeméis.

     Carregar (ou tocar) ABRE UM PAINEL com os sites desse concelho. Não vai direito
     a nenhum deles. O painel fica AO LADO do mapa acima de 900px e por baixo dele
     em ecrãs estreitos: ancorado no centróide, o de Santa Maria da Feira — cinco
     sites, 337px de altura — tapava Leiria e Lisboa.

     As manchas são botões de verdade (role, tabindex, aria-expanded, nome
     acessível), por isso isto funciona com teclado; e o mapa NUNCA é filtrado pelo
     sector: é geografia, não é o estado do filtro.                              */
  const caixa = $('.mapa-caixa')
  const svgMapa = $('.mapa-cima')
  const paineis = $$('.painel')
  const fino = matchMedia('(hover:hover) and (pointer:fine)')

  if (caixa && svgMapa && concPaths.length) {
    const vb = svgMapa.getAttribute('viewBox').split(/\s+/).map(Number)
    const alvos = concPaths.map(p => ({
      p, c: p.dataset.concelho, cx: +p.dataset.cx, cy: +p.dataset.cy,
      li: itensLista.find(li => li.dataset.concelho === p.dataset.concelho) || null,
      bt: document.querySelector(`.conc-lista li[data-concelho="${p.dataset.concelho}"] .cn`),
      painel: document.getElementById('p-' + p.dataset.concelho) || null,
    }))
    let apontado = null
    let abertoEm = null
    let fixado = false      // um clique prende o painel; o hover sozinho não
    let temporizador = null

    function maisPerto (cx, cy) {
      const r = caixa.getBoundingClientRect()
      if (!r.width) return null
      const x = vb[0] + (cx - r.left) / r.width * vb[2]
      const y = vb[1] + (cy - r.top) / r.height * vb[3]
      let melhor = null, d2 = Infinity
      for (const a of alvos) {
        const dd = (a.cx - x) ** 2 + (a.cy - y) ** 2
        if (dd < d2) { d2 = dd; melhor = a }
      }
      // 120 unidades ≈ 70 km: mais longe do que isto e não se está a apontar a nada
      return d2 <= 120 * 120 ? melhor : null
    }

    /* apontar — o realce ao passar (só ponteiro fino) */
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
      porRato = alvo
        ? trabalhos.filter(t => t.concelho === alvo.c && !t.el.classList.contains('fora')).map(t => t.id)
        : null
      pintar()
    }

    /* abrir — o painel com os sites do concelho */

    // As caixas dos outros concelhos assinalados, em píxeis da caixa do mapa. É contra
    // estas que se testa cada posição candidata: o painel pode tapar cinzento, nunca
    // outra mancha.
    function caixasDosOutros (excepto) {
      const r = caixa.getBoundingClientRect()
      const ex = r.width / vb[2], ey = r.height / vb[3]
      const out = []
      for (const a of alvos) {
        if (a === excepto) continue
        let bb; try { bb = a.p.getBBox() } catch { continue }
        out.push({
          x: (bb.x - vb[0]) * ex, y: (bb.y - vb[1]) * ey,
          w: bb.width * ex, h: bb.height * ey,
        })
      }
      return out
    }
    const cruza = (a, b) =>
      a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y

    function posicionar (a) {
      const pa = a.painel
      if (!pa) return
      if (!matchMedia('(min-width:900px)').matches) {
        pa.style.left = pa.style.top = ''
        pa.removeAttribute('data-lado'); pa.style.removeProperty('--bico')
        return
      }
      const r = caixa.getBoundingClientRect()
      if (!r.height) return
      // o painel tem de estar visível para se medir
      const w = pa.offsetWidth, h = pa.offsetHeight
      const cx = (a.cx - vb[0]) / vb[2] * r.width
      const cy = (a.cy - vb[1]) / vb[3] * r.height
      const G = 16   // afastamento da mancha

      // Posições em volta do centróide. Primeiro os lados, centrados; depois os
      // mesmos lados deslizados para cima e para baixo; depois abaixo e acima, também
      // deslizados. Só quando nada disto couber é que o painel sai do mapa — no
      // aglomerado de Aveiro há concelhos cercados por vizinhos assinalados de todos
      // os lados, e é melhor deslizar 40% do que fugir 150px.
      const candidatas = []
      for (const dy of [0, -0.34, 0.34, -0.5, 0.5]) {
        candidatas.push({ lado: 'dir', x: cx + G, y: cy - h / 2 + h * dy })
        candidatas.push({ lado: 'esq', x: cx - G - w, y: cy - h / 2 + h * dy })
      }
      for (const dx of [0, -0.34, 0.34, -0.5, 0.5]) {
        candidatas.push({ lado: 'baixo', x: cx - w / 2 + w * dx, y: cy + G })
        candidatas.push({ lado: 'cima', x: cx - w / 2 + w * dx, y: cy - G - h })
      }
      candidatas.push({ lado: 'esq', x: -G - w, y: cy - h / 2, fora: true })
      const outros = caixasDosOutros(a)
      let escolhida = null
      for (const c of candidatas) {
        // dentro do ecrã?
        const eX = r.left + c.x, eY = r.top + c.y
        if (eX < 6 || eX + w > innerWidth - 6) continue
        if (eY < 6 || eY + h > innerHeight - 6) continue
        // não tapa nenhuma outra mancha?
        if (!c.fora && outros.some(o => cruza({ x: c.x, y: c.y, w, h }, o))) continue
        escolhida = c; break
      }
      if (!escolhida) {
        // nenhuma serve: encosta à esquerda do mapa e prende ao ecrã
        escolhida = { lado: 'esq', x: -G - w, y: Math.min(Math.max(cy - h / 2, 0), r.height - h) }
      }
      pa.style.left = Math.round(escolhida.x) + 'px'
      pa.style.top = Math.round(escolhida.y) + 'px'
      pa.dataset.lado = escolhida.lado
      // o bico aponta ao centróide, mesmo quando o painel foi empurrado
      if (escolhida.lado === 'dir' || escolhida.lado === 'esq') {
        pa.style.setProperty('--bico', Math.round(Math.min(Math.max(cy - escolhida.y, 12), h - 12)) + 'px')
      } else {
        pa.style.setProperty('--bico', Math.round(Math.min(Math.max(cx - escolhida.x, 12), w - 12)) + 'px')
      }
    }

    function abrir (concelho, comFoco = false) {
      abertoEm = concelho
      // em ecrã estreito o painel e o botão de subir ocupam o mesmo canto
      if (concelho) document.body.setAttribute('data-painel', '')
      else document.body.removeAttribute('data-painel')
      for (const pa of paineis) pa.hidden = pa.dataset.concelho !== concelho
      for (const a of alvos) {
        const seu = a.c === concelho
        if (a.bt) a.bt.setAttribute('aria-expanded', String(seu))
        if (seu) { a.p.setAttribute('data-aberto', ''); posicionar(a) }
        else a.p.removeAttribute('data-aberto')
      }
      if (!concelho) return
      // Em ecrã estreito o painel fica por baixo do mapa, que ocupa quase toda a
      // altura: abria fora do ecrã e ninguém o via. Só rola se for preciso.
      const pa = document.getElementById('p-' + concelho)
      if (pa && !matchMedia('(min-width:900px)').matches) {
        const r = pa.getBoundingClientRect()
        if (r.bottom > innerHeight - 8 || r.top < 0) pa.scrollIntoView({ block: 'nearest' })
      }
      if (comFoco) {
        const liga = pa && pa.querySelector('a')
        if (liga) liga.focus()
      }
    }

    /* Carregar e tocar: funciona com rato e com dedo. O clique PRENDE o painel, para
       ele não fugir quando o rato sai do mapa. */
    caixa.addEventListener('click', ev => {
      if (ev.target.closest('.painel')) return
      const a = maisPerto(ev.clientX, ev.clientY)
      if (a && abertoEm === a.c && fixado) { fixado = false; abrir(null); return }
      fixado = !!a
      abrir(a ? a.c : null)
      if (a) ev.preventDefault()
    })

    /* Abrir ao passar o rato, sem clicar. O fecho é tolerante: quem vai do mapa para
       o painel atravessa um vão de 16px, e um fecho imediato tirava-lhe o painel
       debaixo do cursor antes de ele chegar às ligações. */
    const cancelar = () => { if (temporizador) { clearTimeout(temporizador); temporizador = null } }
    const fecharDepois = () => {
      cancelar()
      temporizador = setTimeout(() => { if (!fixado) abrir(null) }, 260)
    }
    if (fino.matches) {
      caixa.addEventListener('pointerover', ev => {
        if (ev.pointerType !== 'mouse') return
        cancelar()
        const a = maisPerto(ev.clientX, ev.clientY)
        if (a && !fixado) abrir(a.c)
      })
      for (const pa of paineis) {
        pa.addEventListener('pointerenter', cancelar)
        pa.addEventListener('pointerleave', ev => { if (ev.pointerType === 'mouse') fecharDepois() })
      }
    }

    /* o nome do concelho é o botão: alvo de 45px, funciona com teclado, e é o mesmo
       painel que o clique no mapa abre. Um comportamento, dois gatilhos. */
    for (const a of alvos) {
      if (!a.bt) continue
      a.bt.addEventListener('click', () => {
        const abrirAgora = abertoEm !== a.c
        fixado = abrirAgora
        abrir(abrirAgora ? a.c : null)
      })
    }
    for (const pa of paineis) {
      pa.querySelector('.painel-x').addEventListener('click', () => {
        const c = pa.dataset.concelho
        fixado = false
        abrir(null)
        const a = alvos.find(x => x.c === c)
        if (a && a.bt) a.bt.focus()
      })
    }
    addEventListener('keydown', ev => {
      if (ev.key !== 'Escape' || !abertoEm) return
      const c = abertoEm
      fixado = false
      abrir(null)
      const a = alvos.find(x => x.c === c)
      if (a && a.bt) a.bt.focus()
    })
    addEventListener('pointerdown', ev => {
      if (!abertoEm) return
      if (caixa.contains(ev.target) || ev.target.closest('.conc-lista')) return
      if (ev.target.closest('.painel')) return
      fixado = false
      abrir(null)
    }, { passive: true })
    addEventListener('resize', () => {
      if (abertoEm) { const a = alvos.find(x => x.c === abertoEm); if (a) posicionar(a) }
    })

    /* o realce ao passar o rato, e o recíproco a partir dos nomes da lista */
    if (fino.matches) {
      caixa.addEventListener('pointermove', ev => {
        if (ev.pointerType !== 'mouse') return
        const a = maisPerto(ev.clientX, ev.clientY)
        apontar(a)
        if (!fixado && a && abertoEm !== a.c) { cancelar(); abrir(a.c) }
      })
      caixa.addEventListener('pointerleave', ev => {
        if (ev.pointerType !== 'mouse') return
        apontar(null)
        fecharDepois()
      })
      for (const a of alvos) {
        if (!a.bt) continue
        a.bt.addEventListener('pointerenter', () => apontar(a))
        a.bt.addEventListener('focus', () => apontar(a))
        a.bt.addEventListener('pointerleave', () => apontar(null))
        a.bt.addEventListener('blur', () => apontar(null))
      }
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
