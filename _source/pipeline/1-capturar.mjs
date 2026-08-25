// Captura os sites com Chrome headless via CDP. Zero dependências.
// node capturar.mjs [id...]
import { spawn } from 'node:child_process'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { writeFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const OUT = resolve(RAIZ, '_source/tmp/shots')
const PORT = 9333

const SITES = [
  ['amma-creative',      'https://renatovalente5.github.io/AMMA_Creative/'],
  ['armazem-dos-pneus',  'https://armazemdospneus.pt/'],
  ['artstampcreations',  'https://artstampcreations.pt/'],
  ['feira-norte-auto',   'https://renatovalente5.github.io/FeiraNorteAuto/'],
  ['gold-cleaning',      'https://goldcleaning.pt/'],
  ['hn-transportes',     'https://hntransportes.pt/'],
  ['hv-limpezas',        'https://hvlimpezas.pt/'],
  ['lr-motors',          'https://lrmotorsautomoveis.pt/'],
  ['marmovar',           'https://renatovalente5.github.io/Marmovar/'],
  ['menta-conecta',      'https://renatovalente5.github.io/MentaConecta/'],
  ['newauto',            'https://renatovalente5.github.io/NewAuto/'],
  ['pau-ferro-atelier',  'https://pauferroatelier.pt/'],
  ['perfect-finish',     'https://renatovalente5.github.io/PerfectFinish/'],
  ['pokeauto',           'https://pokeauto.pt/'],
  ['praiometro',         'https://praiometro.pt/'],
  ['raf-matos',          'https://rafmatos.pt/'],
  ['spa-do-automovel-lux','https://renatovalente5.github.io/SpaDoAutomovelLUX/'],
  ['weldstaff',          'https://weldstaff.pt/'],
]

// Texto de botões que fecham avisos de cookies / consentimento.
const FECHAR = `(() => {
  const alvos = [];
  const rx = /^(aceitar|aceito|concordo|permitir|ok,? entendi|entendi|compreendi|fechar|rejeitar|recusar|só (os )?essenciais|apenas (os )?essenciais|accept|got it|dismiss)/i;
  for (const el of document.querySelectorAll('button, a[role=button], [role=button], input[type=button], input[type=submit]')) {
    const t = (el.innerText || el.value || '').trim();
    if (!t || t.length > 40) continue;
    if (!rx.test(t)) continue;
    const r = el.getBoundingClientRect();
    if (r.width < 4 || r.height < 4) continue;
    alvos.push([el, t]);
  }
  const feitos = [];
  // Preferir "rejeitar/essenciais" a "aceitar" (mais privado), mas fechar sempre.
  alvos.sort((a,b) => {
    const p = s => /rejeit|recus|essenci|fechar|dismiss/i.test(s) ? 0 : 1;
    return p(a[1]) - p(b[1]);
  });
  for (const [el, t] of alvos.slice(0, 3)) { try { el.click(); feitos.push(t); } catch(e){} }
  return feitos;
})()`

// Esconde elementos fixos que tapam o topo (barras de aviso remanescentes).
const LIMPAR = `(() => {
  const fora = [];
  for (const el of document.querySelectorAll('body *')) {
    const cs = getComputedStyle(el);
    if (cs.position !== 'fixed' && cs.position !== 'sticky') continue;
    const r = el.getBoundingClientRect();
    if (r.height < 20 || r.width < 100) continue;
    const txt = (el.innerText || '').slice(0, 400);
    if (/cookie|cookies|consentiment|privacidade|RGPD|aceitar|aceito/i.test(txt)) {
      el.style.setProperty('display', 'none', 'important');
      fora.push(txt.slice(0, 60).replace(/\\s+/g, ' '));
    }
  }
  return fora;
})()`

// Preparação por site: executada depois da 1.ª carga, seguida de recarregamento.
// hntransportes.pt guarda o idioma em localStorage e, sem escolha, segue navigator.language.
const PREP = {
  'hn-transportes': `localStorage.setItem('hn-lang','pt')`,
}

let id = 0
function rpc(ws, method, params = {}, sessionId) {
  return new Promise((res, rej) => {
    const msgId = ++id
    const onMsg = ev => {
      let m; try { m = JSON.parse(ev.data) } catch { return }
      if (m.id !== msgId) return
      ws.removeEventListener('message', onMsg)
      m.error ? rej(new Error(method + ': ' + m.error.message)) : res(m.result)
    }
    ws.addEventListener('message', onMsg)
    ws.send(JSON.stringify(sessionId ? { id: msgId, method, params, sessionId } : { id: msgId, method, params }))
    setTimeout(() => { ws.removeEventListener('message', onMsg); rej(new Error(method + ': timeout')) }, 90000)
  })
}
const sleep = ms => new Promise(r => setTimeout(r, ms))

async function main () {
  mkdirSync(OUT, { recursive: true })
  const only = process.argv.slice(2)
  const lista = only.length ? SITES.filter(s => only.includes(s[0])) : SITES

  const chrome = spawn(CHROME, [
    `--remote-debugging-port=${PORT}`,
    '--headless=new', '--hide-scrollbars', '--force-color-profile=srgb',
    '--disable-gpu', '--no-first-run', '--no-default-browser-check',
    '--user-data-dir=' + resolve(RAIZ, '_source/tmp/chrome-profile'),
    '--lang=pt-PT',
    'about:blank',
  ], { stdio: 'ignore' })

  let alvo
  for (let i = 0; i < 40; i++) {
    await sleep(400)
    try { alvo = await (await fetch(`http://127.0.0.1:${PORT}/json/version`)).json(); break } catch {}
  }
  if (!alvo) { chrome.kill(); throw new Error('Chrome não arrancou') }
  console.log('Chrome:', alvo['Browser'])

  const ws = new WebSocket(alvo.webSocketDebuggerUrl)
  await new Promise(r => ws.addEventListener('open', r, { once: true }))

  const relatorio = []
  for (const [slug, url] of lista) {
    const { targetId } = await rpc(ws, 'Target.createTarget', { url: 'about:blank' })
    const { sessionId } = await rpc(ws, 'Target.attachToTarget', { targetId, flatten: true })
    const S = sessionId
    try {
      await rpc(ws, 'Page.enable', {}, S)
      await rpc(ws, 'Runtime.enable', {}, S)
      await rpc(ws, 'Emulation.setLocaleOverride', { locale: 'pt-PT' }, S).catch(() => {})
      await rpc(ws, 'Network.enable', {}, S).catch(() => {})
      await rpc(ws, 'Network.setExtraHTTPHeaders', { headers: { 'Accept-Language': 'pt-PT,pt;q=0.9' } }, S).catch(() => {})
      await rpc(ws, 'Emulation.setEmulatedMedia', { media: 'screen', features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] }, S)

      const perfis = [
        { nome: 'd', w: 1440, h: 900, dpr: 2, mobile: false },
        { nome: 't', w: 390, h: 844, dpr: 3, mobile: true },
      ]
      const notas = { slug, url }
      for (const p of perfis) {
        await rpc(ws, 'Emulation.setDeviceMetricsOverride', {
          width: p.w, height: p.h, deviceScaleFactor: p.dpr, mobile: p.mobile,
        }, S)
        if (p.mobile) {
          await rpc(ws, 'Emulation.setUserAgentOverride', {
            userAgent: 'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Mobile Safari/537.36',
          }, S)
          await rpc(ws, 'Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 }, S)
        }
        await rpc(ws, 'Page.navigate', { url }, S)
        await sleep(2200)
        if (PREP[slug]) {
          await rpc(ws, 'Runtime.evaluate', { expression: PREP[slug], returnByValue: true }, S).catch(() => {})
          await rpc(ws, 'Page.reload', { ignoreCache: false }, S)
        }
        await sleep(4200)
        // fecha avisos, espera, esconde restos, deixa assentar
        const cliques = await rpc(ws, 'Runtime.evaluate', { expression: FECHAR, returnByValue: true, awaitPromise: false }, S)
        await sleep(900)
        const escondidos = await rpc(ws, 'Runtime.evaluate', { expression: LIMPAR, returnByValue: true }, S)
        // garantir topo da página e imagens decodificadas
        await rpc(ws, 'Runtime.evaluate', { expression: 'window.scrollTo(0,0)' }, S)
        await rpc(ws, 'Runtime.evaluate', {
          expression: `Promise.all([...document.images].filter(i=>i.currentSrc).map(i=>i.decode().catch(()=>{}))).then(()=>document.fonts.ready).then(()=>1)`,
          awaitPromise: true, returnByValue: true,
        }, S).catch(() => {})
        await sleep(1400)
        const { data } = await rpc(ws, 'Page.captureScreenshot', {
          format: 'png', captureBeyondViewport: false, optimizeForSpeed: false,
        }, S)
        const f = join(OUT, `${slug}-${p.nome}.png`)
        writeFileSync(f, Buffer.from(data, 'base64'))
        notas[p.nome] = {
          bytes: Buffer.from(data, 'base64').length,
          cliques: cliques.result?.value || [],
          escondidos: escondidos.result?.value || [],
        }
      }
      relatorio.push(notas)
      const d = notas.d, t = notas.t
      console.log(`✓ ${slug.padEnd(22)} d=${(d.bytes/1024|0)}K t=${(t.bytes/1024|0)}K` +
        (d.cliques.length ? ` cliques:[${d.cliques.join('|')}]` : '') +
        (d.escondidos.length ? ` escondeu:[${d.escondidos.join('|')}]` : ''))
    } catch (e) {
      console.log(`✗ ${slug}: ${e.message}`)
      relatorio.push({ slug, url, erro: e.message })
    } finally {
      await rpc(ws, 'Target.closeTarget', { targetId }).catch(() => {})
    }
  }
  writeFileSync(join(OUT, 'relatorio.json'), JSON.stringify(relatorio, null, 1))
  ws.close(); chrome.kill()
  console.log('\nFeito. ' + relatorio.filter(r => !r.erro).length + '/' + lista.length)
}
main().catch(e => { console.error(e); process.exit(1) })
