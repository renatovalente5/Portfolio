#!/bin/bash
# Descarrega as geometrias oficiais dos 308 municípios de json.geoapi.pt (CAOP).
# Só é preciso correr outra vez se a Carta Administrativa mudar.
set -euo pipefail
cd "$(dirname "$0")/../tmp"
mkdir -p muni
curl -sfL "https://json.geoapi.pt/municipios?json=1" -o municipios.json
python3 - <<'PY'
import json, urllib.parse
nomes = json.load(open('municipios.json'))
with open('muni_slugs.txt', 'w') as f:
    for n in nomes:
        f.write(n + "\t" + urllib.parse.quote(n) + "\n")
print(len(nomes), "municípios listados")
PY
: > falhas.txt
n=0
while IFS=$'\t' read -r nome enc; do
  out="muni/$(echo "$nome" | tr '/ ' '__').json"
  if [ ! -s "$out" ]; then
    ( curl -sfL --max-time 40 --retry 3 --retry-delay 2 \
        "https://json.geoapi.pt/municipios/${enc}?json=1" -o "$out" \
      || { echo "FALHA: $nome" >> falhas.txt; rm -f "$out"; } ) &
  fi
  n=$((n+1)); [ $((n % 10)) -eq 0 ] && wait
done < muni_slugs.txt
wait
echo "descarregados: $(ls muni | wc -l)  ·  falhas: $(wc -l < falhas.txt)"
cat falhas.txt
