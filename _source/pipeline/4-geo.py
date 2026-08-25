#!/usr/bin/env python3
"""Constrói concelhos.json (308 centróides) e o mapa administrativo de Portugal
a partir das geometrias oficiais descarregadas de json.geoapi.pt (CAOP)."""
import json, math, os, re, sys, unicodedata
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
BASE = REPO / '_source/tmp'
MUNI = BASE / 'muni'          # ver 0-municipios.sh
OUT  = REPO / '_source/dados'
OUT.mkdir(parents=True, exist_ok=True)

# ── nomes: geoapi devolve casing irregular («Albergaria-a-velha», «Alfândega da fé»)
MINUSCULAS = {'de','do','da','dos','das','e','a','o','as','os','em','no','na'}
def titulo(nome):
    partes = re.split(r'(\s+|-)', nome)
    out, primeiro = [], True
    for p in partes:
        if not p.strip() or p == '-':
            out.append(p); continue
        low = p.lower()
        if low in MINUSCULAS and not primeiro:
            out.append(low)
        else:
            out.append(low[0].upper() + low[1:])
        primeiro = False
    return ''.join(out)

def sem_acentos(s):
    return ''.join(c for c in unicodedata.normalize('NFD', s)
                   if unicodedata.category(c) != 'Mn').lower()

# ── ler tudo
ILHAS = {'Açores', 'Madeira', 'Ilha da Madeira', 'Ilha de Porto Santo'}
concelhos = []
for f in sorted(MUNI.glob('*.json')):
    d = json.loads(f.read_text())
    g = d['geojson']
    geom = g['geometry']
    props = g.get('properties', {})
    centros = props.get('centros', {})
    c = centros.get('centroide') or centros.get('centroDeMassa') or centros.get('centro')
    if not c:
        print('SEM CENTRO:', d['nome'], file=sys.stderr); continue
    lon, lat = float(c[0]), float(c[1])
    rings = geom['coordinates'] if geom['type'] == 'Polygon' else [r for poly in geom['coordinates'] for r in poly]
    if geom['type'] == 'MultiPolygon':
        rings = [poly[0] for poly in geom['coordinates']] + \
                [r for poly in geom['coordinates'] for r in poly[1:]]
    else:
        rings = geom['coordinates']
    di = d.get('distrito_ilha') or d.get('distrito') or ''
    concelhos.append({
        'nome': titulo(d['nome']),
        'distrito': titulo(di),
        'ine': d.get('codigoine', ''),
        'lat': lat, 'lon': lon,
        'ilha': di in ILHAS or not (36.8 <= lat <= 42.2 and -9.6 <= lon <= -6.1),
        'rings': rings,
    })

cont = [c for c in concelhos if not c['ilha']]
print(f'{len(concelhos)} concelhos · {len(cont)} continente · {len(concelhos)-len(cont)} ilhas')

# guarda de projecção: EPSG:4326 e nada mais
for c in concelhos:
    if not (-32 <= c['lon'] <= -6 and 30 <= c['lat'] <= 43):
        sys.exit(f"GUARDA: coordenadas fora de Portugal em {c['nome']}: {c['lon']},{c['lat']}")

# ── concelhos.json — só nome + coordenadas, compacto
comp = sorted([[c['nome'], round(c['lat'], 3), round(c['lon'], 3)] for c in concelhos],
              key=lambda x: sem_acentos(x[0]))
(REPO / 'data/concelhos.json').write_text(json.dumps(comp, ensure_ascii=False, separators=(',', ':')))
print('concelhos.json:', (REPO / 'data/concelhos.json').stat().st_size, 'bytes')

# ── projecção equirectangular centrada (continente)
LON0, LAT_REF = -8.60, 39.6
K = 1.0
COSL = math.cos(math.radians(LAT_REF))
def proj(lon, lat):
    return ((lon - LON0) * COSL, (42.20 - lat))

# extensão do continente para calibrar o viewBox
xs, ys = [], []
for c in cont:
    for r in c['rings']:
        for lon, lat in r:
            x, y = proj(lon, lat); xs.append(x); ys.append(y)
minx, maxx, miny, maxy = min(xs), max(xs), min(ys), max(ys)
ALTURA = 1000.0
K = ALTURA / (maxy - miny)
LARGURA = round((maxx - minx) * K, 1)
def px(lon, lat):
    x, y = proj(lon, lat)
    return ((x - minx) * K, (y - miny) * K)
K_KM = K / 111.32  # unidades svg por km (aprox., latitude de referência)
print(f'viewBox 0 0 {LARGURA} {ALTURA}  ·  {K_KM:.4f} un/km  ·  1 un = {1/K_KM:.2f} km')

# ── Douglas-Peucker
def dp(pts, tol):
    if len(pts) < 3: return pts
    dmax, idx = 0.0, 0
    (x1, y1), (x2, y2) = pts[0], pts[-1]
    dx, dy = x2 - x1, y2 - y1
    n2 = dx * dx + dy * dy
    for i in range(1, len(pts) - 1):
        x, y = pts[i]
        d = abs(dx * (y1 - y) - dy * (x1 - x)) / math.sqrt(n2) if n2 else math.hypot(x - x1, y - y1)
        if d > dmax: dmax, idx = d, i
    if dmax <= tol: return [pts[0], pts[-1]]
    return dp(pts[:idx + 1], tol)[:-1] + dp(pts[idx:], tol)

sys.setrecursionlimit(20000)

def area(pts):
    s = 0.0
    for i in range(len(pts)):
        x1, y1 = pts[i]; x2, y2 = pts[(i + 1) % len(pts)]
        s += x1 * y2 - x2 * y1
    return abs(s) / 2

def caminho(rings, tol, area_min, casas=1):
    """Rings em lon/lat → string de path SVG projectada e simplificada."""
    partes = []
    for r in rings:
        pts = [px(lon, lat) for lon, lat in r]
        if len(pts) > 2 and pts[0] == pts[-1]: pts = pts[:-1]
        if len(pts) < 3: continue
        if area(pts) < area_min: continue
        s = dp(pts + [pts[0]], tol)
        if len(s) > 2 and s[0] == s[-1]: s = s[:-1]
        if len(s) < 3: continue
        f = f'%.{casas}f'
        d = 'M' + (f % s[0][0]) + ' ' + (f % s[0][1])
        px_, py_ = s[0]
        for x, y in s[1:]:
            d += 'l' + (f % (x - px_)) + ' ' + (f % (y - py_))
            px_, py_ = x, y
        partes.append(d + 'z')
    return ''.join(partes)

TOL = float(os.environ.get('TOL', '1.1'))      # unidades svg (1 un ≈ 1,26 km)
AMIN = float(os.environ.get('AMIN', '6'))      # descarta ilhotas
mapa = []
for c in sorted(cont, key=lambda c: c['nome']):
    d = caminho(c['rings'], TOL, AMIN)
    if not d:
        d = caminho(c['rings'], TOL / 3, 0)
    mapa.append({'nome': c['nome'], 'ine': c['ine'], 'd': d,
                 'cx': round(px(c['lon'], c['lat'])[0], 1),
                 'cy': round(px(c['lon'], c['lat'])[1], 1)})

total = sum(len(m['d']) for m in mapa)
print(f'{len(mapa)} concelhos do continente · path total {total/1024:.1f} KB')

json.dump({
    'viewBox': [0, 0, LARGURA, ALTURA],
    'k_km': round(K_KM, 6),
    'lon0': LON0, 'lat_ref': LAT_REF, 'minx': minx, 'miny': miny, 'K': K,
    'concelhos': mapa,
}, open(OUT / 'mapa-continente.json', 'w'), ensure_ascii=False, separators=(',', ':'))
print('mapa-continente.json:', (OUT / 'mapa-continente.json').stat().st_size, 'bytes')

# ── verificação: os 12 concelhos dos trabalhos existem e caem em terra
ALVOS = ['Viana do Castelo', 'Ovar', 'Vizela', 'Santa Maria da Feira', 'Oliveira de Azeméis',
         'Vila Verde', 'Lisboa', 'Valongo', 'Leiria', 'São João da Madeira',
         'Vila Nova de Gaia', 'Portalegre']
idx = {m['nome']: m for m in mapa}
falta = [a for a in ALVOS if a not in idx]
print('CONCELHOS EM FALTA:', falta if falta else 'nenhum')
for a in ALVOS:
    if a in idx:
        m = idx[a]
        print(f"  {a:22} cx={m['cx']:6.1f} cy={m['cy']:6.1f}  path {len(m['d']):5}B")
