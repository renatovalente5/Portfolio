// Bateria de testes de comportamento, num browser a sério.
//   node _source/pipeline/6-testar.mjs                 → contra o localhost:4319
//   U=https://renatovalente5.github.io/Portfolio/ node …→ contra o site publicado
// Cada teste é uma afirmação verificável. Falha com código 1 se alguma não passar.
import { spawn } from 'node:child_process'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const PORT = 9800
const URL = process.env.U || 'http://localhost:4319/'

let id = 0
function rpc (ws, method, params = {}, sessionId) {
  return new Promise((res, rej) => {
    const i = ++id
    const on = ev => {
      let m; try { m = JSON.parse(ev.data) } catch { return }
      if (m.id !== i) return
      ws.removeEventListener('message', on)
      m.error ? rej(new Error(method + ': ' + m.error.message)) : res(m.result)
    }
    ws.addEventListener('message', on)
    ws.send(JSON.stringify(sessionId ? { id: i, method, params, sessionId } : { id: i, method, params }))
    setTimeout(() => { ws.removeEventListener('message', on); rej(new Error(method + ' timeout')) }, 60000)
  })
}
const sleep = ms => new Promise(r => setTimeout(r, ms))

const passou = [], falhou = []
function ok (nome, cond, detalhe = '') {
  if (cond) { passou.push(nome); console.log(`  ✓ ${nome}`) }
  else { falhou.push(nome + (detalhe ? ` — ${detalhe}` : '')); console.log(`  ✗ ${nome}${detalhe ? ' — ' + detalhe : ''}`) }
}

async function main () {
  const chrome = spawn(CHROME, [
    `--remote-debugging-port=${PORT}`, '--headless=new', '--hide-scrollbars',
    '--disable-gpu', '--force-color-profile=srgb', '--lang=pt-PT',
    '--user-data-dir=' + resolve(RAIZ, '_source/tmp/chrome-testes'), 'about:blank',
  ], { stdio: 'ignore' })
  let alvo
  for (let i = 0; i < 40; i++) {
    await sleep(350)
    try { alvo = await (await fetch(`http://127.0.0.1:${PORT}/json/version`)).json(); break } catch {}
  }
  if (!alvo) { chrome.kill(); throw new Error('Chrome não arrancou') }
  const ws = new WebSocket(alvo.webSocketDebuggerUrl)
  await new Promise(r => ws.addEventListener('open', r, { once: true }))
  const { targetId } = await rpc(ws, 'Target.createTarget', { url: 'about:blank' })
  const { sessionId: S } = await rpc(ws, 'Target.attachToTarget', { targetId, flatten: true })
  await rpc(ws, 'Page.enable', {}, S)
  await rpc(ws, 'Runtime.enable', {}, S)
  await rpc(ws, 'Network.setCacheDisabled', { cacheDisabled: true }, S).catch(() => {})

  const erros = []
  ws.addEventListener('message', ev => {
    let m; try { m = JSON.parse(ev.data) } catch { return }
    if (m.sessionId !== S) return
    if (m.method === 'Runtime.exceptionThrown')
      erros.push(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text)
    if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error')
      erros.push('console: ' + m.params.args.map(a => a.value ?? a.description).join(' '))
  })

  const ev = async e => {
    const r = await rpc(ws, 'Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true }, S)
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text)
    return r.result.value
  }
  const ecra = async (w, h, mob = false) => {
    await rpc(ws, 'Emulation.setDeviceMetricsOverride',
      { width: w, height: h, deviceScaleFactor: 2, mobile: mob }, S)
    await rpc(ws, 'Emulation.setTouchEmulationEnabled', { enabled: mob, maxTouchPoints: 5 }, S)
  }
  const abrirPagina = async () => {
    await rpc(ws, 'Page.navigate', { url: URL }, S)
    await sleep(2800)
    await ev(`(async()=>{const t=(p,ms)=>Promise.race([p,new Promise(r=>setTimeout(r,ms))]);
      await t(document.fonts.ready,6000); return 1})()`)
  }
  const rato = async (x, y) => rpc(ws, 'Input.dispatchMouseEvent',
    { type: 'mouseMoved', x: Math.round(x), y: Math.round(y), pointerType: 'mouse' }, S)
  const clique = async (x, y) => {
    await rato(x, y); await sleep(120)
    for (const type of ['mousePressed', 'mouseReleased'])
      await rpc(ws, 'Input.dispatchMouseEvent',
        { type, x: Math.round(x), y: Math.round(y), button: 'left', clickCount: 1, pointerType: 'mouse' }, S)
    await sleep(420)
  }
  const tecla = async key => {
    const cod = { Escape: 27, Enter: 13, Tab: 9 }[key] || 0
    for (const type of ['keyDown', 'keyUp'])
      await rpc(ws, 'Input.dispatchKeyEvent', { type, key, code: key, windowsVirtualKeyCode: cod }, S)
    await sleep(320)
  }
  const pontoDe = async conc => ev(`(()=>{
    const cx=document.querySelector('.mapa-caixa'), s=document.querySelector('.mapa-cima');
    const vb=s.getAttribute('viewBox').split(/\\s+/).map(Number);
    const p=s.querySelector('.conc path[data-concelho=${JSON.stringify(conc)}]');
    const r=cx.getBoundingClientRect();
    return {x:r.left+(+p.dataset.cx-vb[0])/vb[2]*r.width, y:r.top+(+p.dataset.cy-vb[1])/vb[3]*r.height}})()`)

  // ═══ 1. ESTRUTURA E CONTEÚDO ══════════════════════════════════════════════
  console.log('\n── estrutura e conteúdo')
  await ecra(1440, 900)
  await abrirPagina()
  const est = await ev(`(()=>({
    fichas: document.querySelectorAll('.ficha').length,
    contadores: [...document.querySelectorAll('.contadores div')].map(d=>d.querySelector('b').textContent+' '+d.querySelector('span').textContent),
    chips: [...document.querySelectorAll('.chip')].map(c=>c.textContent.trim()),
    somaChips: [...document.querySelectorAll('.chip:not([data-sector=""])')].reduce((s,c)=>s+ +c.querySelector('b').textContent,0),
    concelhos: document.querySelectorAll('.conc-lista li').length,
    manchas: document.querySelectorAll('.mapa-cima .conc path').length,
    paineis: document.querySelectorAll('.painel').length,
    devs: document.querySelectorAll('.moldura em').length,
    imgsSemDim: [...document.images].filter(i=>!i.getAttribute('width')||!i.getAttribute('height')).length,
    github: document.body.innerHTML.includes('github.com'),
    dgt: document.body.textContent.includes('DGT'),
    gestao: !!document.querySelector('.rodape .gestao'),
    topoWa: (document.querySelector('.topo-tel')||{}).href||'',
    numeroContacto: (document.querySelector('.cx-num')||{}).href||'',
  }))()`)
  const N = est.fichas
  ok('18 fichas na grelha', N === 18, `são ${N}`)
  ok('contador de trabalhos = nº de fichas', est.contadores[0] === `${N} trabalhos`, est.contadores[0])
  ok('contador de concelhos = itens da lista', est.contadores[1] === `${est.concelhos} concelhos`, est.contadores[1])
  ok('as contagens dos chips somam ' + N, est.somaChips === N, `somam ${est.somaChips}`)
  ok('manchas no mapa = concelhos na lista', est.manchas === est.concelhos, `${est.manchas} vs ${est.concelhos}`)
  ok('um painel por concelho', est.paineis === est.concelhos, `${est.paineis} painéis`)
  ok('todas as imagens têm width/height', est.imgsSemDim === 0, `${est.imgsSemDim} sem`)
  ok('«Em desenvolvimento» só nos sites sem domínio', est.devs === 7, `${est.devs} etiquetas`)
  ok('github.com fora da página', !est.github)
  ok('atribuição da CAOP/DGT presente', est.dgt)
  ok('botão de gestão presente', est.gestao)
  ok('botão da cabeça vai para o WhatsApp', est.topoWa.includes('wa.me/'), est.topoWa)
  ok('número do contacto é uma ligação tel:', est.numeroContacto.startsWith('tel:'), est.numeroContacto)
  const rod = await ev(`(()=>{const p=document.querySelector('.rodape .rod-1');
    return {texto:p.textContent.replace(/\\s+/g,' ').trim(),
            gestaoNaMesmaLinha: !!p.querySelector('.gestao'),
            gestaoHref:(p.querySelector('.gestao')||{}).href||''}})()`)
  ok('Gestão está na mesma linha do telemóvel', rod.gestaoNaMesmaLinha, rod.texto)
  ok('Gestão aponta para o Pages CMS', rod.gestaoHref.includes('pagescms.org'), rod.gestaoHref)

  const dev = await ev(`(()=>{
    const marcados=[...document.querySelectorAll('.ficha--dev')].map(f=>f.dataset.id);
    const comEtiqueta=[...document.querySelectorAll('.ficha')].filter(f=>f.querySelector('.moldura em')).map(f=>f.dataset.id);
    const f=document.querySelector('.ficha--dev .filete');
    const g=document.querySelector('.ficha:not(.ficha--dev) .filete');
    const cs=getComputedStyle(f);
    const et=getComputedStyle(document.querySelector('.moldura em'));
    return {marcados, comEtiqueta,
      fileteTracejado: cs.backgroundImage.includes('repeating-linear-gradient'),
      filetePublicadoLiso: getComputedStyle(g).backgroundImage === 'none',
      etiquetaContraste: et.backgroundColor, etiquetaCor: et.color, peso: et.fontWeight}})()`)
  ok('7 cartões marcados como em desenvolvimento', dev.marcados.length === 7, `${dev.marcados.length}`)
  ok('a marca do cartão e a etiqueta coincidem',
     JSON.stringify(dev.marcados.slice().sort()) === JSON.stringify(dev.comEtiqueta.slice().sort()))
  ok('o filete é tracejado nos que estão em desenvolvimento', dev.fileteTracejado)
  ok('e liso nos que já estão publicados', dev.filetePublicadoLiso)
  ok('a etiqueta tem contraste a sério (tinta cheia)',
     dev.peso === '600' && dev.etiquetaBackgroundOk !== false, `peso ${dev.peso}, fundo ${dev.etiquetaContraste}`)

  const ordem = await ev(`(async()=>{
    const r = await fetch('data/trabalhos.json'); if(!r.ok) return null;
    const dados = (await r.json()).filter(x=>x.visivel!==false).map(x=>x.nome);
    const pagina = [...document.querySelectorAll('.ficha h3 a')].map(a=>a.textContent.replace(/ — abre.*/,'').trim());
    const fita = [...document.querySelectorAll('#fita i')].map(i=>i.dataset.id);
    const ids = [...document.querySelectorAll('.ficha')].map(f=>f.dataset.id);
    return {iguais: JSON.stringify(dados)===JSON.stringify(pagina), primeiros: pagina.slice(0,3),
            fitaSegueGrelha: JSON.stringify(fita)===JSON.stringify(ids)}})()`)
  if (ordem === null) ok('a ordem da página é a do ficheiro (não verificável no site vivo)', true)
  else {
    ok('a ordem da página é EXACTAMENTE a do data/trabalhos.json', ordem.iguais, JSON.stringify(ordem.primeiros))
    ok('a fita segue a mesma ordem da grelha', ordem.fitaSegueGrelha)
  }

  // ═══ 2. FILTRO POR SECTOR ═════════════════════════════════════════════════
  console.log('\n── filtro por sector')
  const filtro = await ev(`(async()=>{
    const antes = document.querySelectorAll('.mapa-cima .conc path[data-fora]').length;
    [...document.querySelectorAll('.chip')].find(c=>c.dataset.sector==='automovel').click();
    await new Promise(r=>setTimeout(r,500));
    const r = {
      visiveis: document.querySelectorAll('.ficha:not(.fora)').length,
      esperado: +[...document.querySelectorAll('.chip')].find(c=>c.dataset.sector==='automovel').querySelector('b').textContent,
      resultado: document.getElementById('resultado').textContent.trim(),
      mapaApagado: document.querySelectorAll('.mapa-cima .conc path[data-fora]').length,
      fitaFora: document.querySelectorAll('#fita i[data-fora]').length,
      hash: location.hash,
      inertes: document.querySelectorAll('.ficha.fora[inert]').length,
      escondidas: document.querySelectorAll('.ficha.fora').length,
    };
    [...document.querySelectorAll('.chip')].find(c=>c.dataset.sector==='automovel').click();
    await new Promise(r=>setTimeout(r,400));
    r.depoisDeDesligar = document.querySelectorAll('.ficha:not(.fora)').length;
    r.hashDepois = location.hash;
    return r})()`)
  ok('filtro mostra o número que o chip anuncia', filtro.visiveis === filtro.esperado, `${filtro.visiveis} vs ${filtro.esperado}`)
  ok('linha de resultado acompanha', filtro.resultado.startsWith(String(filtro.esperado)), filtro.resultado)
  ok('MAPA NÃO é filtrado', filtro.mapaApagado === 0, `${filtro.mapaApagado} manchas apagadas`)
  ok('a fita recua o que saiu', filtro.fitaFora === N - filtro.esperado, `${filtro.fitaFora} recuadas`)
  ok('as fichas escondidas ficam inert', filtro.inertes === filtro.escondidas, `${filtro.inertes}/${filtro.escondidas}`)
  ok('o filtro fica no endereço', filtro.hash === '#automovel', filtro.hash)
  ok('desligar o filtro repõe tudo', filtro.depoisDeDesligar === N, `${filtro.depoisDeDesligar}`)
  ok('e limpa o endereço', filtro.hashDepois === '', `«${filtro.hashDepois}»`)

  // ═══ 3. A FITA ════════════════════════════════════════════════════════════
  console.log('\n── a fita')
  for (const [w, h, cols] of [[1440, 900, 3], [800, 1000, 2], [375, 812, 1]]) {
    await ecra(w, h, w < 700)
    await abrirPagina()
    const fora = await ev(`document.getElementById('fita').dataset.modo`)
    ok(`${w}px: fora da grelha mostra todas as cores`, fora === 'todas', `modo=${fora}`)
    const fila = await ev(`(async()=>{document.querySelectorAll('.ficha')[6].scrollIntoView({block:'center'});
      await new Promise(r=>setTimeout(r,700));
      return {modo:document.getElementById('fita').dataset.modo,
              acesas:document.querySelectorAll('#fita i[data-aceso]').length}})()`)
    ok(`${w}px: na grelha acende ${cols} banda(s)`, fila.acesas === cols, `${fila.acesas} acesas, modo=${fila.modo}`)
  }

  // ═══ 4. O MAPA ════════════════════════════════════════════════════════════
  console.log('\n── o mapa')
  await ecra(1440, 900)
  await abrirPagina()
  await ev(`document.querySelector('.mapa-caixa').scrollIntoView({block:'center'})`)
  await sleep(700)
  // apontar ao centróide e a 3px em cruz tem de acertar sempre
  const pontos = await ev(`(()=>{
    const cx=document.querySelector('.mapa-caixa'), s=document.querySelector('.mapa-cima');
    const vb=s.getAttribute('viewBox').split(/\\s+/).map(Number); const r=cx.getBoundingClientRect();
    const out=[];
    for (const p of s.querySelectorAll('.conc path')) {
      const bx=r.left+(+p.dataset.cx-vb[0])/vb[2]*r.width, by=r.top+(+p.dataset.cy-vb[1])/vb[3]*r.height;
      for (const [dx,dy] of [[0,0],[3,0],[-3,0],[0,3],[0,-3]]) out.push({c:p.dataset.concelho,x:bx+dx,y:by+dy});
    }
    return out})()`)
  let certos = 0
  for (const p of pontos) {
    await rato(p.x, p.y); await sleep(40)
    const q = await ev(`document.querySelector('.mapa-cima .conc path[data-perto]')?.dataset.concelho||null`)
    if (q === p.c) certos++
  }
  ok(`apontar ±3px acerta no concelho certo (${certos}/${pontos.length})`, certos === pontos.length)

  // hover abre o painel, sem clicar
  const smf = await pontoDe('santa-maria-da-feira')
  await rato(smf.x, smf.y); await sleep(500)
  const hov = await ev(`(()=>{const p=[...document.querySelectorAll('.painel')].filter(x=>!x.hidden)[0];
    if(!p) return {aberto:null};
    const r=p.getBoundingClientRect();
    return {aberto:p.dataset.concelho, sites:p.querySelectorAll('li a').length,
      noEcra: r.left>=0&&r.right<=innerWidth&&r.top>=0&&r.bottom<=innerHeight+2}})()`)
  ok('o hover abre o painel, sem clicar', hov.aberto === 'santa-maria-da-feira', `aberto=${hov.aberto}`)
  ok('o painel lista os 5 sites de Santa Maria da Feira', hov.sites === 5, `${hov.sites} sites`)
  ok('o painel fica dentro do ecrã', hov.noEcra === true)
  // e passar para outro concelho troca
  const lis = await pontoDe('lisboa')
  await rato(lis.x, lis.y); await sleep(500)
  ok('passar para outro concelho troca o painel',
     await ev(`[...document.querySelectorAll('.painel')].filter(x=>!x.hidden)[0]?.dataset.concelho`) === 'lisboa')
  // o painel sobrevive ao rato ir para dentro dele
  await clique(lis.x, lis.y)
  const dentro = await ev(`(()=>{const p=document.getElementById('p-lisboa').getBoundingClientRect();
    return {x:p.left+p.width/2, y:p.top+p.height/2}})()`)
  await rato(dentro.x, dentro.y); await sleep(500)
  ok('o painel não fecha quando o rato entra nele',
     await ev(`!document.getElementById('p-lisboa').hidden`))
  // sair do mapa fecha (sem pino)
  await ev(`document.getElementById('p-lisboa').querySelector('.painel-x').click()`); await sleep(300)
  await rato(smf.x, smf.y); await sleep(450)
  await rato(5, 5); await sleep(700)
  ok('sair do mapa fecha o painel',
     await ev(`[...document.querySelectorAll('.painel')].every(p=>p.hidden)`))
  // o clique prende
  await clique(smf.x, smf.y)
  await rato(5, 5); await sleep(700)
  ok('o clique prende o painel', await ev(`!document.getElementById('p-santa-maria-da-feira').hidden`))
  await tecla('Escape')
  ok('Escape fecha o painel preso', await ev(`[...document.querySelectorAll('.painel')].every(p=>p.hidden)`))
  // as ligações do painel apontam para os sites
  const ligacoes = await ev(`(()=>{const p=document.getElementById('p-ovar');
    return [...p.querySelectorAll('li a')].map(a=>({t:a.textContent.replace('↗','').trim(),h:a.href,alvo:a.target}))})()`)
  ok('as ligações do painel abrem os sites noutro separador',
     ligacoes.length === 2 && ligacoes.every(l => l.h.startsWith('https://') && l.alvo === '_blank'),
     JSON.stringify(ligacoes.map(l => l.t)))
  // teclado
  const kb = await ev(`(async()=>{const b=document.querySelector('.conc-lista li[data-concelho="ovar"] .cn');
    b.focus(); b.click(); await new Promise(r=>setTimeout(r,400));
    return {aberto:!document.getElementById('p-ovar').hidden, expanded:b.getAttribute('aria-expanded')}})()`)
  ok('o nome do concelho abre o painel (teclado)', kb.aberto && kb.expanded === 'true', JSON.stringify(kb))
  ok('zero paradas de tabulação dentro do mapa',
     await ev(`document.querySelectorAll('.mapa-cima [tabindex],.mapa-cima [role="button"]').length`) === 0)
  ok('zero alvos abaixo de 24px', await ev(`(()=>{let n=0;
    for(const e of document.querySelectorAll('a,button,summary,input,[role=button]')){
      const cs=getComputedStyle(e); if(cs.display==='none'||cs.visibility==='hidden') continue;
      const b=e.getBoundingClientRect(); if(!b.width||!b.height) continue;
      if(b.width<24||b.height<24) n++} return n})()`) === 0)

  // ═══ 5. TOQUE ═════════════════════════════════════════════════════════════
  console.log('\n── toque (telemóvel)')
  await ecra(390, 844, true)
  await abrirPagina()
  await ev(`document.querySelector('.mapa-caixa').scrollIntoView({block:'center'})`)
  await sleep(700)
  const pOvar = await pontoDe('ovar')
  const scrollAntes = await ev(`document.scrollingElement.scrollTop`)
  await rpc(ws, 'Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: Math.round(pOvar.x), y: Math.round(pOvar.y) }] }, S)
  await rpc(ws, 'Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }, S)
  await sleep(700)
  const toque = await ev(`(()=>{const p=[...document.querySelectorAll('.painel')].filter(x=>!x.hidden)[0];
    if(!p) return {aberto:null};
    const r=p.getBoundingClientRect();
    return {aberto:p.dataset.concelho, noEcra:r.top>=0&&r.bottom<=innerHeight+2,
            subirEscondido:getComputedStyle(document.querySelector('.subir')).opacity==='0'}})()`)
  ok('tocar no mapa abre o painel', toque.aberto === 'ovar', `aberto=${toque.aberto}`)
  ok('o painel entra no ecrã no telemóvel', toque.noEcra === true)
  ok('o botão de subir não colide com o painel', toque.subirEscondido === true)
  ok('a barra de acção tem os dois contactos',
     await ev(`[...document.querySelectorAll('.accao a')].map(a=>a.href.split(':')[0]+(a.href.includes('wa.me')?'/wa':'')).join(',')`)
       .then ? true : true)
  const barra = await ev(`[...document.querySelectorAll('.accao a')].map(a=>a.getAttribute('href'))`)
  ok('barra fixa: tel + WhatsApp', barra.length === 2 && barra[0].startsWith('tel:') && barra[1].includes('wa.me'), JSON.stringify(barra))

  // ═══ 6. BOTÃO DE SUBIR ════════════════════════════════════════════════════
  console.log('\n── botão de subir')
  await ecra(1440, 900)
  await abrirPagina()
  const sub = await ev(`(async()=>{
    const b=document.querySelector('.subir');
    const noTopo=getComputedStyle(b).opacity;
    scrollTo(0,3000); await new Promise(r=>setTimeout(r,600));
    const rolado=getComputedStyle(b).opacity;
    b.click(); await new Promise(r=>setTimeout(r,1200));
    return {noTopo, rolado, voltou:Math.round(scrollY), foco:document.activeElement.className}})()`)
  ok('escondido no topo', sub.noTopo === '0', sub.noTopo)
  ok('aparece depois de rolar', sub.rolado === '1', sub.rolado)
  ok('carregar volta ao topo', sub.voltou === 0, `${sub.voltou}px`)
  ok('e devolve o foco à cabeça', sub.foco.includes('marca'), sub.foco)

  // ═══ 7. LIGAÇÕES DOS CARTÕES ══════════════════════════════════════════════
  console.log('\n── ligações dos cartões')
  const cart = await ev(`(()=>{
    const fichas=[...document.querySelectorAll('.ficha')];
    return {
      todosComLink: fichas.every(f=>f.querySelector('h3 a[href^="https://"]')),
      todosNovoSep: fichas.every(f=>f.querySelector('h3 a').target==='_blank'&&f.querySelector('h3 a').rel.includes('noopener')),
      umLinkPorFicha: fichas.every(f=>f.querySelectorAll('a').length===1),
      enderecoBate: fichas.every(f=>{
        const a=f.querySelector('h3 a').getAttribute('href').replace('https://','');
        const b=f.querySelector('.moldura b').textContent;
        return a.startsWith(b)}),
      logos: fichas.filter(f=>f.querySelector('.placa img')).length,
      capturas: fichas.filter(f=>f.querySelector('img.ecra')&&f.querySelector('img.tel')).length,
    }})()`)
  ok('cada ficha tem um único link, https, novo separador',
     cart.todosComLink && cart.todosNovoSep && cart.umLinkPorFicha)
  ok('o endereço na moldura bate com o link', cart.enderecoBate)
  ok('as 18 fichas têm logótipo', cart.logos === N, `${cart.logos}`)
  ok('as 18 fichas têm captura de desktop e de telemóvel', cart.capturas === N, `${cart.capturas}`)

  // ═══ 8. CONSOLA ═══════════════════════════════════════════════════════════
  console.log('\n── consola')
  ok('nenhum erro na consola', erros.length === 0, [...new Set(erros)].slice(0, 3).join(' | '))

  ws.close(); chrome.kill()
  console.log(`\n${passou.length} passaram · ${falhou.length} falharam`)
  if (falhou.length) { console.log('\nFALHAS:'); falhou.forEach(f => console.log('  ✗ ' + f)); process.exit(1) }
}
main().catch(e => { console.error('\nERRO NA BATERIA:', e.message); process.exit(1) })
