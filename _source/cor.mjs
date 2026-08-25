// Aritmética de cor: sRGB, OKLab/OKLCh, contraste WCAG.
// Serve para (a) derivar de cada cor de marca uma variante com contraste garantido
// contra os dois fundos da página, e (b) calcular o matiz para o censo cromático.
// Sem dependências.

export function deHex (s) {
  s = String(s).trim().replace(/^#/, '')
  if (s.length === 3) s = s.split('').map(c => c + c).join('')
  return [parseInt(s.slice(0, 2), 16), parseInt(s.slice(2, 4), 16), parseInt(s.slice(4, 6), 16)]
}
export const paraHex = ([r, g, b]) =>
  '#' + [r, g, b].map(v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('').toUpperCase()

const aLinear = c => { c /= 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4 }
const deLinear = c => 255 * (c <= 0.0031308 ? c * 12.92 : 1.055 * c ** (1 / 2.4) - 0.055)

export const luminancia = rgb => 0.2126 * aLinear(rgb[0]) + 0.7152 * aLinear(rgb[1]) + 0.0722 * aLinear(rgb[2])
export function contraste (a, b) {
  const [x, y] = [luminancia(a), luminancia(b)].sort((p, q) => q - p)
  return (x + 0.05) / (y + 0.05)
}

// ── OKLab (Björn Ottosson) ────────────────────────────────────────────────
export function paraOklab (rgb) {
  const r = aLinear(rgb[0]), g = aLinear(rgb[1]), b = aLinear(rgb[2])
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b)
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b)
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b)
  return [
    0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s,
  ]
}
export function deOklab ([L, A, B]) {
  const l = (L + 0.3963377774 * A + 0.2158037573 * B) ** 3
  const m = (L - 0.1055613458 * A - 0.0638541728 * B) ** 3
  const s = (L - 0.0894841775 * A - 1.2914855480 * B) ** 3
  return [
    deLinear(+4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
    deLinear(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
    deLinear(-0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s),
  ]
}
export function paraOklch (rgb) {
  const [L, a, b] = paraOklab(rgb)
  return [L, Math.hypot(a, b), (Math.atan2(b, a) * 180 / Math.PI + 360) % 360]
}
export const deOklch = ([L, C, h]) =>
  deOklab([L, C * Math.cos(h * Math.PI / 180), C * Math.sin(h * Math.PI / 180)])

/** Sobe ou desce a luminosidade OKLCh de uma cor até atingir o contraste pedido
 *  contra `fundo`. Mantém matiz e croma — a cor continua a ser a da marca.
 *  Devolve null se nem o preto nem o branco chegarem (não acontece na prática). */
export function ajustarPara (hexMarca, hexFundo, alvo = 4.5) {
  const marca = deHex(hexMarca), fundo = deHex(hexFundo)
  // O contraste avalia-se SEMPRE na cor já arredondada a 8 bits — é essa que vai
  // para o CSS. Avaliar no contínuo faz a procura parar em 4,49:1 depois do
  // arredondamento, e a auditoria (com razão) rejeita.
  const arred = rgb => deHex(paraHex(rgb))
  if (contraste(arred(marca), fundo) >= alvo) return paraHex(marca)
  const [L0, C, h] = paraOklch(marca)
  const escurecer = luminancia(fundo) > 0.18   // fundo claro -> escurecer a marca
  let lo = escurecer ? 0 : 1                   // extremo que certamente cumpre
  let hi = L0                                  // extremo que certamente não cumpre
  if (contraste(arred(deOklch([lo, C, h])), fundo) < alvo) return escurecer ? '#000000' : '#FFFFFF'
  let melhor = paraHex(deOklch([lo, C, h]))
  for (let i = 0; i < 40; i++) {
    const L = (lo + hi) / 2
    const hex = paraHex(deOklch([L, C, h]))
    if (contraste(deHex(hex), fundo) >= alvo) { melhor = hex; lo = L } else { hi = L }
  }
  return melhor
}

/** Nome da família de matiz, em PT-PT. Limiares em graus de OKLCh — que NÃO são
 *  os de HSL: em OKLCh o dourado vive nos 70–100°, não nos 40–50°. Medidos nas
 *  dezoito marcas reais e escritos aqui em claro, para o censo não mentir. */
export function familia (hex) {
  const [L, C, h] = paraOklch(deHex(hex))
  if (C < 0.030) return 'neutro'
  if (h < 40 || h >= 355) return 'vermelho'
  if (h < 62) return L < 0.50 ? 'castanho' : 'laranja'
  if (h < 105) return 'ouro'
  if (h < 150) return 'lima'
  if (h < 192) return 'verde'
  if (h < 238) return 'turquesa'
  if (h < 300) return 'azul'
  if (h < 340) return 'violeta'
  return 'rosa'
}
export const matiz = hex => Math.round(paraOklch(deHex(hex))[2])

/** Luminosidade OKLCh normalizada, para dar a 18 marcas a mesma presença óptica
 *  numa banda de cor: um #602601 e um #AEFE05 não podem pesar o mesmo em bruto. */
export function normalizada (hex, alvo = 0.66) {
  const [, C, h] = paraOklch(deHex(hex))
  return paraHex(deOklch([alvo, Math.min(C, 0.19), h]))
}
