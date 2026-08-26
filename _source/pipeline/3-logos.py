#!/usr/bin/env python3
"""Para cada logótipo do cliente, RESOLVE a cor da placa: varre uma rampa de tons
(neutros e tingidos com a cor da marca) e escolhe o que perde menos arte.
Um logótipo com preto E branco na mesma peça ganha uma placa de meio-tom, onde
as duas metades se lêem. A arte do cliente nunca é redesenhada nem recolorida —
só recortada, redimensionada e posta sobre a placa que a serve."""
import json, math, re, subprocess
from pathlib import Path
from PIL import Image

REPO = Path(__file__).resolve().parents[2]
RAIZ = REPO.parent
SC = Path(__file__).resolve().parents[2] / '_source/tmp'
OUT = SC / 'logos-out'; FINAL = REPO / 'assets/logos'
DADOS = REPO / '_source/dados/logos.json'   # é este que o build lê
OUT.mkdir(exist_ok=True); FINAL.mkdir(parents=True, exist_ok=True)
LIMITE = 1.55   # contraste mínimo para um pixel se considerar visível

MARCA = {
 'amma-creative':'#602601','armazem-dos-pneus':'#FECB00','artstampcreations':'#1A8CE4',
 'feira-norte-auto':'#AEFE05','gold-cleaning':'#D4AF37','hn-transportes':'#E6A019',
 'hv-limpezas':'#C9A961','lr-motors':'#004AAD','marmovar':'#C2A24C','menta-conecta':'#17987A',
 'newauto':'#EA3223','pau-ferro-atelier':'#1E4B52','perfect-finish':'#AC8A39','pokeauto':'#F5B921',
 'praiometro':'#0E7490','raf-matos':'#1B4C82','spa-do-automovel-lux':'#C8924C','weldstaff':'#F59E0B',
}
CAND = {
 'amma-creative':['AMMA_Creative/assets/img/logo-marrom.png','AMMA_Creative/assets/img/logo-branco.png'],
 'armazem-dos-pneus':['ArmazemDosPneus/assets/img/logo.png','ArmazemDosPneus/assets/img/logo-white-detail.png'],
 'artstampcreations':['Art_Stamp_Creations/assets/img/logo.png'],
 'feira-norte-auto':['FeiraNorteAuto/assets/img/logo.png'],
 'gold-cleaning':['GoldCleaning/assets/img/logo-full.webp'],
 'hn-transportes':['HN_Transportes/assets/img/logo.png','HN_Transportes/assets/img/logo-light.png'],
 'hv-limpezas':['HV_Limpezas/assets/img/logo.webp'],
 'lr-motors':['LR_Motors/assets/img/logo.svg'],
 'marmovar':['Marmovar/src/assets/brand/logo.png','Marmovar/src/assets/brand/logo-mark.png'],
 'menta-conecta':['MentaConecta/assets/img/logo.png','MentaConecta/assets/img/logo-white.png'],
 'newauto':['NewAuto/assets/img/logo-escuro.png','NewAuto/assets/img/logo-claro.png'],
 'pau-ferro-atelier':['PauFerroAtelier/assets/img/logo-tinta.png','PauFerroAtelier/assets/img/logo-claro.png'],
 'perfect-finish':['PerfectFinish/assets/img/marca/logotipo.svg'],
 'pokeauto':['PokeAuto/assets/img/logo-760.webp'],
 'praiometro':['Praiometro/assets/img/favicon.svg'],
 'raf-matos':['RafMatos/assets/img/logo-full.png','RafMatos/assets/img/logo-wordmark.webp'],
 'spa-do-automovel-lux':['SpaDoAutomovelLUX/assets/img/logo-full.webp'],
 'weldstaff':['WeldStaff/src/assets/img/weldstaff_full_logo.png'],
}
SVG_TINTAS = {'lr-motors': ['#0A1B33', '#FFFFFF']}

def lin(c):
    c /= 255
    return c/12.92 if c <= .03928 else ((c+.055)/1.055)**2.4
def L(rgb): return .2126*lin(rgb[0]) + .7152*lin(rgb[1]) + .0722*lin(rgb[2])
def contr(a, b):
    a, b = max(a, b), min(a, b); return (a+.05)/(b+.05)
def mist(fg, a, bg): return tuple(fg[i]*a + bg[i]*(1-a) for i in range(3))
def hx(rgb): return '#%02X%02X%02X' % tuple(max(0, min(255, int(round(v)))) for v in rgb)
def de_hex(s):
    s = s.lstrip('#'); return tuple(int(s[i:i+2], 16) for i in (0, 2, 4))

# Só DUAS placas em toda a página: tinta quase-preta ou branco.
# Duas tonalidades lêem-se como sistema; dezoito lêem-se como desarrumação.
# Branco por omissão — foi o pedido. A tinta quase-preta só entra quando a arte do
# cliente é literalmente branca e desaparece no branco (Gold Cleaning tem as letras a
# branco; o Feira Norte Auto é todo lima #AEFE05). Não se redesenha arte de cliente.
BRANCO = (255, 255, 255)
ESCURO = (23, 25, 29)
LIMITE_TROCA = 0.55   # acima desta perda em branco, procura-se o escuro
def rampa(marca): return [BRANCO, ESCURO]

def fundo_opaco(im):
    """Um PNG/JPG sem transparência é um logótipo sobre um fundo sólido. O fundo lê-se
    nos quatro cantos: se concordarem, os pixéis dessa cor são fundo, não arte. Sem isto
    o branco do fundo do Marmovar conta como «arte perdida» numa placa branca, e a
    métrica prefere a marca isolada ao logótipo completo."""
    w, h = im.size; px = im.load()
    cantos = [px[0, 0], px[w-1, 0], px[0, h-1], px[w-1, h-1]]
    if any(c[3] < 250 for c in cantos): return None      # tem transparência: já se sabe o que é arte
    base = cantos[0][:3]
    if all(max(abs(c[i]-base[i]) for i in range(3)) <= 6 for c in cantos): return base
    return None

def pixeis(p):
    im = Image.open(p).convert('RGBA'); w, h = im.size; px = im.load()
    bg = fundo_opaco(im)
    passo = max(1, int(math.sqrt(w*h/40000)))
    pts = []
    minx, miny, maxx, maxy = w, h, -1, -1
    for y in range(0, h, passo):
        for x in range(0, w, passo):
            r, g, b, a = px[x, y]
            if a < 40: continue
            if bg and max(abs(r-bg[0]), abs(g-bg[1]), abs(b-bg[2])) <= 10: continue   # é fundo
            pts.append((r, g, b, a/255))
            if x < minx: minx = x
            if y < miny: miny = y
            if x > maxx: maxx = x
            if y > maxy: maxy = y
    if not pts: return None, None, None
    largura = (maxx-minx)//passo + 1
    altura  = (maxy-miny)//passo + 1
    cobertura = len(pts) / max(1, largura*altura)
    return pts, round((maxx-minx+1)/(maxy-miny+1), 3), round(cobertura, 4)

def perda(pts, placa):
    """Custo = fracção de arte perdida + penalização se o quartil inferior for fraco.
    Um logótipo pode estar todo acima do mínimo e ainda assim parecer lavado."""
    Lp = L(placa)
    cs = sorted(contr(L(mist((r, g, b), a, placa)), Lp) for r, g, b, a in pts)
    perdidos = sum(1 for c in cs if c < LIMITE) / len(cs)
    q1 = cs[len(cs)//4]
    lavado = max(0.0, (2.6 - q1) / 2.6) * 0.45
    return round(perdidos + lavado, 5)

def rasterizar(src, dest, altura, cor):
    txt = Path(src).read_text(errors='ignore')
    m = re.search(r'viewBox=["\']([\d.\-\s,]+)["\']', txt)
    if m:
        vb = [float(v) for v in re.split(r'[\s,]+', m.group(1).strip())]; rac = vb[2]/vb[3]
    else:
        mw = re.search(r'\swidth=["\']([\d.]+)', txt); mh = re.search(r'\sheight=["\']([\d.]+)', txt)
        rac = float(mw.group(1))/float(mh.group(1)) if (mw and mh) else 3.0
    W = max(1, int(round(altura*rac)))
    html = OUT / (Path(dest).stem + '.html')
    html.write_text(f'<style>html,body{{margin:0;background:transparent;'
                    + (f'color:{cor}' if cor else '') + f'}}svg{{display:block;width:{W}px;height:{altura}px}}</style>' + txt)
    subprocess.run(['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
        '--headless=new','--disable-gpu','--default-background-color=00000000',
        f'--window-size={W},{altura}',f'--screenshot={dest}','file://'+str(html)], capture_output=True)
    return dest

def forma(r):
    if r >= 2.6:  return 'largo', 18, 36
    if r >= 1.15: return 'medio', 24, 42
    return 'alto', 32, 50

dec = {}
print(f'{"slug":22} {"ficheiro":26} {"placa":9} {"tinta":>6} {"rácio":>6}  forma  altura')
print('─'*96)
for slug, cands in CAND.items():
    # Duas passagens. Primeiro procura-se, entre TODAS as variantes do logótipo, a que
    # melhor se lê em BRANCO. Só se nenhuma sobreviver é que se admite a placa escura —
    # e isso só acontece quando a arte do cliente é literalmente branca.
    def avaliar (placa):
        m_best = None
        for c in cands:
            p = RAIZ / c
            if not p.exists(): continue
            fontes = [(OUT/f'{slug}-{(t or "auto").strip("#")}.png', t) for t in SVG_TINTAS.get(slug, [None])] \
                     if p.suffix == '.svg' else [(p, None)]
            for f, tinta in fontes:
                if p.suffix == '.svg': rasterizar(p, f, 320, tinta)
                pts, rac, cob = pixeis(f)
                if not pts: continue
                m = dict(slug=slug, origem=str(p.relative_to(RAIZ)), render=str(f), tinta=tinta,
                         racio=rac, cobertura=cob, perda=round(perda(pts, placa), 4), placa=hx(placa))
                if m_best is None or m['perda'] < m_best['perda'] - 0.004:
                    m_best = m
        return m_best

    melhor = avaliar(BRANCO)
    if melhor is None or melhor['perda'] > LIMITE_TROCA:
        alt = avaliar(ESCURO)
        if alt is not None and (melhor is None or alt['perda'] < melhor['perda'] - 0.15):
            melhor = alt
    if not melhor: print('SEM LOGO:', slug); continue
    fo, hl, hp = forma(melhor['racio'])
    # logótipos de traço fino desaparecem à altura nominal: dá-se-lhes mais corpo
    cob = melhor['cobertura']
    if cob < 0.30:
        boost = min(1.42, 0.30 / max(cob, 0.10))
        hl = int(round(hl * boost)); hp = int(round(hp * boost))
    melhor.update(forma=fo, h_logo=hl, h_placa=hp, boost=round(hl/forma(melhor['racio'])[1], 2))
    dec[slug] = melhor
    av = '  ⚠' if melhor['perda'] > .30 else ''
    print(f'{slug:22} {Path(melhor["origem"]).name[:26]:26} {melhor["placa"]:9} '
          f'{melhor["cobertura"]*100:5.1f}% {melhor["racio"]:6.2f}  {fo:6} {melhor["h_logo"]}px'
          + (f'  ×{melhor["boost"]}' if melhor["boost"] > 1.01 else '') + av)

print('\n── webp gerado ──')
for slug, d in dec.items():
    im = Image.open(d['render']).convert('RGBA')
    bb = im.getbbox()
    if bb: im = im.crop(bb)
    alvo = d['h_logo'] * 2
    im = im.resize((max(1, round(im.width*alvo/im.height)), alvo), Image.LANCZOS)
    tmp = OUT / f'{slug}-final.png'; im.save(tmp)
    dest = FINAL / f'{slug}.webp'
    subprocess.run(['cwebp','-quiet','-q','92' if im.width <= 170 else '84',
                    '-alpha_q','100',str(tmp),'-o',str(dest)], check=True)
    d['w_disp'] = round(im.width/2); d['h_disp'] = d['h_logo']; d['bytes'] = dest.stat().st_size
    print(f'  {slug:22} {d["w_disp"]:3}×{d["h_disp"]:2} na placa {d["h_placa"]}px · {d["placa"]} · {d["bytes"]/1024:5.1f} KB')

json.dump({k: {kk: vv for kk, vv in v.items() if kk != 'render'} for k, v in dec.items()},
          open(DADOS,'w'), ensure_ascii=False, indent=1)
print(f'\n{len(dec)}/18 · {sum(d["bytes"] for d in dec.values())/1024:.1f} KB · '
      f'pior perda {max(d["perda"] for d in dec.values())*100:.1f}%')
