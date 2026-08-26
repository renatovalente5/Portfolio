// Render de verificação: página inteira, várias larguras, claro e escuro.
// Corre o Chrome com o separador em primeiro plano (num separador oculto o rAF
// não corre e a captura mente) e mede overflow horizontal e alvos pequenos.
import { spawn } from 'node:child_process'
import { join, dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { writeFileSync, readFileSync, mkdirSync } from 'node:fs'

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const OUT = resolve(RAIZ, '_source/tmp/ver')
const PORT = 9444
const URL = process.env.URL || 'http://localhost:4319/'

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
    setTimeout(() => { ws.removeEventListener('message', on); rej(new Error(method + ' timeout' + (params && params.expression ? ' :: ' + String(params.expression).slice(0,70).replace(/\s+/g,' ') : ''))) }, 180000)
  })
}
const sleep = ms => new Promise(r => setTimeout(r, ms))

/** Bandas de 400px cujo desvio-padrão de luminância é quase nulo: nada foi pintado.
 *  Lê o PNG com o Chrome, para não precisar de bibliotecas de imagem. */
async function bandasPlanas (ficheiro) {
  const { targetId } = await rpc(GLOBAL.ws, 'Target.createTarget', { url: 'about:blank' })
  const { sessionId: S } = await rpc(GLOBAL.ws, 'Target.attachToTarget', { targetId, flatten: true })
  try {
    await rpc(GLOBAL.ws, 'Runtime.enable', {}, S)
    const dados = readFileSync(ficheiro).toString('base64')
    const r = await rpc(GLOBAL.ws, 'Runtime.evaluate', {
      expression: `(async()=>{
        const im = new Image();
        im.src = 'data:image/png;base64,${dados}';
        await im.decode();
        const H = 400, cv = new OffscreenCanvas(160, H), cx = cv.getContext('2d');
        const planas = [];
        for (let y = 0; y + H <= im.height; y += H) {
          cx.clearRect(0,0,160,H);
          cx.drawImage(im, 0, y, im.width, H, 0, 0, 160, H);
          const d = cx.getImageData(0,0,160,H).data;
          let s = 0, s2 = 0, n = 0;
          for (let i = 0; i < d.length; i += 64) {
            const L = .2126*d[i] + .7152*d[i+1] + .0722*d[i+2];
            s += L; s2 += L*L; n++;
          }
          const dp = Math.sqrt(Math.max(0, s2/n - (s/n)**2));
          if (dp < 4) planas.push(y);
        }
        return planas
      })()`,
      awaitPromise: true, returnByValue: true,
    }, S)
    return r.result.value || []
  } catch { return [] } finally {
    await rpc(GLOBAL.ws, 'Target.closeTarget', { targetId }).catch(() => {})
  }
}
const GLOBAL = {}

const DIAG = `(() => {
  const r = {};
  const se = document.scrollingElement;
  r.overflow = se.scrollWidth - se.clientWidth;
  r.altura = se.scrollHeight;
  r.vw = innerWidth;
  const pequenos = [];
  for (const el of document.querySelectorAll('a,button,summary,input,[role=button]')) {
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden') continue;
    const b = el.getBoundingClientRect();
    if (!b.width || !b.height) continue;
    if (b.width < 24 || b.height < 24) {
      pequenos.push((el.tagName.toLowerCase()) + '.' + (el.className || '').toString().slice(0,24)
        + ' ' + Math.round(b.width) + 'x' + Math.round(b.height)
        + ' «' + (el.textContent || '').trim().slice(0, 26) + '»');
    }
  }
  r.alvos_pequenos = pequenos;
  const fora = [];
  for (const el of document.querySelectorAll('body *')) {
    const b = el.getBoundingClientRect();
    if (b.width && (b.right > innerWidth + 1.5 || b.left < -1.5)) {
      fora.push(el.tagName.toLowerCase() + '.' + (el.className||'').toString().slice(0,26)
        + ' [' + Math.round(b.left) + '..' + Math.round(b.right) + ']');
      if (fora.length > 9) break;
    }
  }
  r.transbordam = fora;
  r.imgs_sem_dim = [...document.images].filter(i => !i.getAttribute('width') || !i.getAttribute('height')).length;
  r.imgs = document.images.length;
  r.h1 = (document.querySelector('h1')||{}).textContent?.trim().slice(0,60);
  r.fonte_h1 = document.querySelector('h1') ? getComputedStyle(document.querySelector('h1')).fontFamily : '';
  r.fichas = document.querySelectorAll('.ficha').length;
  r.fichas_visiveis = [...document.querySelectorAll('.ficha')].filter(f => !f.classList.contains('fora')).length;
  return r;
})()`

async function main () {
  mkdirSync(OUT, { recursive: true })
  const chrome = spawn(CHROME, [
    `--remote-debugging-port=${PORT}`, '--headless=new', '--hide-scrollbars',
    '--force-color-profile=srgb', '--disable-gpu', '--no-first-run',
    '--user-data-dir=' + resolve(RAIZ, '_source/tmp/chrome-profile-ver'), '--lang=pt-PT', 'about:blank',
  ], { stdio: 'ignore' })
  let alvo
  for (let i = 0; i < 40; i++) {
    await sleep(350)
    try { alvo = await (await fetch(`http://127.0.0.1:${PORT}/json/version`)).json(); break } catch {}
  }
  if (!alvo) { chrome.kill(); throw new Error('Chrome não arrancou') }
  const ws = new WebSocket(alvo.webSocketDebuggerUrl)
  await new Promise(r => ws.addEventListener('open', r, { once: true }))
  GLOBAL.ws = ws

  const CASOS = (process.env.CASOS ? JSON.parse(process.env.CASOS) : [
    { n: '360-claro', w: 360, h: 780, dpr: 3, tema: 'light', mob: true },
    { n: '390-escuro', w: 390, h: 844, dpr: 3, tema: 'dark', mob: true },
    { n: '768-claro', w: 768, h: 1024, dpr: 2, tema: 'light', mob: true },
    { n: '1280-claro', w: 1280, h: 900, dpr: 2, tema: 'light', mob: false },
    { n: '1440-escuro', w: 1440, h: 900, dpr: 2, tema: 'dark', mob: false },
  ])

  const problemas = []
  for (const c of CASOS) {
    const { targetId } = await rpc(ws, 'Target.createTarget', { url: 'about:blank' })
    const { sessionId: S } = await rpc(ws, 'Target.attachToTarget', { targetId, flatten: true })
    await rpc(ws, 'Page.enable', {}, S)
    await rpc(ws, 'Runtime.enable', {}, S)
    await rpc(ws, 'Log.enable', {}, S).catch(() => {})
    const consola = []
    ws.addEventListener('message', ev => {
      let m; try { m = JSON.parse(ev.data) } catch { return }
      if (m.sessionId !== S) return
      if (m.method === 'Runtime.consoleAPICalled' && ['error', 'warning'].includes(m.params.type))
        consola.push(m.params.type + ': ' + m.params.args.map(a => a.value ?? a.description).join(' '))
      if (m.method === 'Runtime.exceptionThrown')
        consola.push('EXCEPÇÃO: ' + (m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text))
      if (m.method === 'Log.entryAdded' && m.params.entry.level === 'error')
        consola.push('log: ' + m.params.entry.text)
    })
    await rpc(ws, 'Emulation.setDeviceMetricsOverride',
      { width: c.w, height: c.h, deviceScaleFactor: c.dpr, mobile: !!c.mob }, S)
    await rpc(ws, 'Emulation.setEmulatedMedia',
      { media: 'screen', features: [{ name: 'prefers-color-scheme', value: c.tema }] }, S)
    await rpc(ws, 'Page.navigate', { url: c.url || URL }, S)
    await sleep(2600)
    if (c.antes) { await rpc(ws, 'Runtime.evaluate', { expression: c.antes, awaitPromise: true, returnByValue: true }, S); await sleep(1400) }
    await rpc(ws, 'Runtime.evaluate', {
      // decode() numa imagem lazy que o browser ainda não pediu pode nunca resolver.
      // E o Chrome serializa as chamadas da sessão: uma que pendura aqui deixa TODAS
      // as seguintes na fila, e o timeout aparece na chamada errada.
      expression: `(async()=>{
        const tecto = (p, ms) => Promise.race([p, new Promise(r => setTimeout(r, ms))]);
        await tecto(document.fonts.ready, 8000);
        await tecto(Promise.all([...document.images].map(i => i.decode().catch(()=>{}))), 12000);
        return 1 })()`,
      awaitPromise: true, returnByValue: true,
    }, S).catch(() => {})
    await sleep(900)
    const d = (await rpc(ws, 'Runtime.evaluate', { expression: DIAG, returnByValue: true }, S)).result.value
    console.log(`\n── ${c.n}  (${c.w}px, ${c.tema})`)
    console.log(`   altura ${d.altura}px · fichas ${d.fichas_visiveis}/${d.fichas} · imgs ${d.imgs} (sem dim: ${d.imgs_sem_dim})`)
    console.log(`   fonte h1: ${d.fonte_h1}`)
    // Captura da página inteira. As fichas têm content-visibility:auto: ao esticar o
    // ecrã para a altura toda, os cartões ficam «em vista» mas ainda não pintados, e
    // as imagens lazy só então começam a ser pedidas. Sem forçar um percurso pela
    // página e esperar pelas descodificações, a captura sai em branco a partir da
    // grelha — e mente a dizer que está tudo bem.
    const alturaMax = Math.min(d.altura, 16000)
    await rpc(ws, 'Emulation.setDeviceMetricsOverride',
      { width: c.w, height: alturaMax, deviceScaleFactor: 1, mobile: !!c.mob }, S)
    await sleep(600)
    await rpc(ws, 'Runtime.evaluate', {
      expression: `(async()=>{
        for (const el of document.querySelectorAll('.ficha')) el.style.contentVisibility='visible';
        for (const y of [0,.25,.5,.75,1]) { scrollTo(0, document.body.scrollHeight*y); await new Promise(r=>setTimeout(r,120)) }
        scrollTo(0,0);
        const imgs=[...document.images];
        // Um <img loading="lazy"> que o browser ainda não pediu NÃO dispara load nem
        // error: esperar por ele sem tecto pendura o verificador para sempre. Cada
        // imagem corre contra um relógio, e no fim conta-se quem ficou por carregar.
        const espera = i => i.complete ? Promise.resolve() : new Promise(r => {
          const t = setTimeout(r, 12000);
          const fim = () => { clearTimeout(t); r() };
          i.addEventListener('load', fim, {once:true});
          i.addEventListener('error', fim, {once:true});
        });
        await Promise.all(imgs.map(espera));
        await Promise.all(imgs.map(i => i.decode().catch(()=>{})));
        await document.fonts.ready;
        return imgs.filter(i => !i.complete || !i.naturalWidth).length
      })()`,
      awaitPromise: true, returnByValue: true,
    }, S).then(
      r => { if (r.result.value) problemas.push(`${c.n}: ${r.result.value} imagens não carregaram`) },
      e => { problemas.push(`${c.n}: falhou a preparar a captura (${e.message})`) })
    // esperado, e não deixado a correr: sem isto a linha «altura real» sai debaixo
    // do caso seguinte e aponta para o sítio errado.
    await sleep(1600)
    // Voltar a medir a altura REAL. Não serve `scrollHeight` com o ecrã já esticado —
    // o ecrã define o mínimo e devolve sempre a altura estimada. Mede-se o fundo do
    // último elemento, que é a altura do conteúdo e não a da janela.
    const altura2 = Math.ceil((await rpc(ws, 'Runtime.evaluate', {
      expression: `(() => {
        let max = 0;
        for (const el of document.body.children) {
          const r = el.getBoundingClientRect();
          if (getComputedStyle(el).position === 'fixed') continue;
          max = Math.max(max, r.bottom + scrollY);
        }
        return max + parseFloat(getComputedStyle(document.body).paddingBottom || 0)
      })()`, returnByValue: true }, S)).result.value)
    if (altura2 > 0 && Math.abs(altura2 - alturaMax) > 8) {
      await rpc(ws, 'Emulation.setDeviceMetricsOverride',
        { width: c.w, height: Math.min(altura2, 16000), deviceScaleFactor: 1, mobile: !!c.mob }, S)
      await sleep(500)
      console.log(`   altura real ${altura2}px (estimada ${alturaMax}px)`)
    }
    const shot = await rpc(ws, 'Page.captureScreenshot', { format: 'png', captureBeyondViewport: true }, S)
    const png = Buffer.from(shot.data, 'base64')
    writeFileSync(join(OUT, `${c.n}.png`), png)
    // Guarda contra capturas em branco: uma banda sem variação de luz é uma banda que
    // não pintou. Aconteceu, passou por boa, e só se viu a olho.
    const planas = await bandasPlanas(join(OUT, `${c.n}.png`))
    if (planas.length) {
      console.log(`   ✗ ${planas.length} bandas sem conteúdo pintado (y=${planas.slice(0,4).join(', ')}…)`)
      problemas.push(`${c.n}: ${planas.length} bandas em branco na captura`)
    }
    if (d.overflow > 1) { console.log(`   ✗ OVERFLOW HORIZONTAL: ${d.overflow}px`); problemas.push(`${c.n}: overflow ${d.overflow}px`) }
    if (d.transbordam.length) { console.log('   ✗ transbordam:'); d.transbordam.forEach(x => console.log('       ' + x)); problemas.push(`${c.n}: ${d.transbordam.length} elementos fora`) }
    if (d.alvos_pequenos.length) { console.log('   ⚠ alvos <24px:'); d.alvos_pequenos.forEach(x => console.log('       ' + x)); problemas.push(`${c.n}: ${d.alvos_pequenos.length} alvos pequenos`) }
    if (d.imgs_sem_dim) problemas.push(`${c.n}: ${d.imgs_sem_dim} imagens sem width/height`)
    if (consola.length) { console.log('   ✗ consola:'); [...new Set(consola)].slice(0, 6).forEach(x => console.log('       ' + x)); problemas.push(`${c.n}: erros na consola`) }
    await rpc(ws, 'Target.closeTarget', { targetId })
  }
  console.log('\n' + (problemas.length ? 'PROBLEMAS:\n  ' + problemas.join('\n  ') : 'sem problemas detectados'))
  ws.close(); chrome.kill()
}
main().catch(e => { console.error(e); process.exit(1) })
