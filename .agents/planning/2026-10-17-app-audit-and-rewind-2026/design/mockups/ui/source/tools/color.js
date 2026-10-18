// OKLCH <-> sRGB helpers + WCAG contrast. Usage: require('./color.js')
function oklchToOklab(L, C, H) {
  const h = (H * Math.PI) / 180
  return [L, C * Math.cos(h), C * Math.sin(h)]
}
function oklabToLinear([L, a, b]) {
  const l_ = L + 0.3963377774 * a + 0.2158037573 * b
  const m_ = L - 0.1055613458 * a - 0.0638541728 * b
  const s_ = L - 0.0894841775 * a - 1.291485548 * b
  const l = l_ ** 3, m = m_ ** 3, s = s_ ** 3
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ]
}
const gamma = (x) => (x <= 0.0031308 ? 12.92 * x : 1.055 * Math.pow(x, 1 / 2.4) - 0.055)
const ungamma = (x) => (x <= 0.04045 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4))
const clamp = (x) => Math.min(1, Math.max(0, x))
function oklch(L, C, H) {
  const lin = oklabToLinear(oklchToOklab(L, C, H))
  const inGamut = lin.every((v) => v >= -0.0005 && v <= 1.0005)
  const srgb = lin.map((v) => clamp(gamma(clamp(v))))
  return { srgb, inGamut }
}
function hex(srgb) {
  return '#' + srgb.map((v) => Math.round(v * 255).toString(16).padStart(2, '0')).join('')
}
function lum(srgb) {
  const [r, g, b] = srgb.map(ungamma)
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}
function contrast(a, b) {
  const la = lum(a), lb = lum(b)
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05)
}
function mix(fg, bg, alpha) {
  // composite in sRGB gamma space (what browsers do for color-mix in srgb / rgba overlays)
  return fg.map((v, i) => v * alpha + bg[i] * (1 - alpha))
}
function hexToSrgb(h) {
  h = h.replace('#', '')
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255)
}
function srgbToOklch(srgb) {
  const [r, g, b] = srgb.map(ungamma)
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b)
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b)
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b)
  const L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s
  const a = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s
  const bb = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s
  const C = Math.sqrt(a * a + bb * bb)
  let H = (Math.atan2(bb, a) * 180) / Math.PI
  if (H < 0) H += 360
  return [L, C, H]
}
module.exports = { oklch, hex, lum, contrast, mix, hexToSrgb, srgbToOklch }
