#!/usr/bin/env python3
"""Converte as capturas 1440x900@2x e 390x844@3x em conjuntos webp responsivos."""
import json, subprocess, sys
from datetime import date
from pathlib import Path
from PIL import Image

SC = Path(__file__).resolve().parents[2] / '_source/tmp'
DEST = Path(__file__).resolve().parents[2] / 'assets/capturas'
DEST.mkdir(parents=True, exist_ok=True)

LARG_D = [480, 720, 1080]   # desktop, 16:10
LARG_T = [300]              # telemóvel, 390x844 -> 300w chega para exibir ~130px @2x
Q = {480: 78, 720: 74, 1080: 68, 300: 76}

rel = {}
for p in sorted((SC / 'shots').glob('*-d.png')):
    slug = p.stem[:-2]
    im = Image.open(p).convert('RGB')
    # a captura vem 2880x1800 (1440x900 @2x) -> já é 16:10, sem recorte
    assert abs(im.width / im.height - 1.6) < 0.02, f'{slug}: {im.size} não é 16:10'
    fich = []
    for w in LARG_D:
        o = im.resize((w, round(w / 1.6)), Image.LANCZOS)
        tmp = SC / f'tmp-{slug}-{w}.png'; o.save(tmp)
        d = DEST / f'{slug}-{w}.webp'
        subprocess.run(['cwebp', '-quiet', '-q', str(Q[w]), '-m', '6', '-sharp_yuv',
                        str(tmp), '-o', str(d)], check=True)
        tmp.unlink()
        fich.append((w, d.stat().st_size))
    t = SC / 'shots' / f'{slug}-t.png'
    tf = []
    if t.exists():
        imt = Image.open(t).convert('RGB')
        rac = imt.height / imt.width
        for w in LARG_T:
            o = imt.resize((w, round(w * rac)), Image.LANCZOS)
            tmp = SC / f'tmp-{slug}-t{w}.png'; o.save(tmp)
            d = DEST / f'{slug}-t{w}.webp'
            subprocess.run(['cwebp', '-quiet', '-q', str(Q[w]), '-m', '6', '-sharp_yuv',
                            str(tmp), '-o', str(d)], check=True)
            tmp.unlink()
            tf.append((w, d.stat().st_size))
        rac_t = round(imt.width / imt.height, 4)
    else:
        rac_t = None
    rel[slug] = {'desktop': fich, 'telefone': tf, 'racio_telefone': rac_t,
                 'capturado_em': date.today().isoformat()}
    print(f'{slug:22} d: ' + ' '.join(f'{w}={b//1024}K' for w, b in fich)
          + '   t: ' + ' '.join(f'{w}={b//1024}K' for w, b in tf))

json.dump(rel, open(DEST / 'capturas.json', 'w'), indent=1)
td = sum(b for v in rel.values() for _, b in v['desktop'])
tt = sum(b for v in rel.values() for _, b in v['telefone'])
p1080 = sum(b for v in rel.values() for w, b in v['desktop'] if w == 1080)
p720  = sum(b for v in rel.values() for w, b in v['desktop'] if w == 720)
print(f'\n{len(rel)} sites · tudo {(td+tt)/1024/1024:.2f} MB')
print(f'sessão desktop (1080w + telefone): {(p1080+tt)/1024:.0f} KB')
print(f'sessão telemóvel (720w + telefone): {(p720+tt)/1024:.0f} KB')
