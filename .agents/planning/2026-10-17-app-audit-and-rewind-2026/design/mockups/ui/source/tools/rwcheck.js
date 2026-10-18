// Rewind scope contract check: the 12 print inks from rewind-2026-design.md 5.2 and every
// component state the shared primitives can take inside [data-theme="rewind"].
// Rules (Rewind 5.2, NFR-4): text 7:1 or better (ink on field, deep on paper); spot and other
// non-text marks 3:1 or better against the field. Usage: node rwcheck.js [--md]
const c = require('./color.js')
const o = (L, C, H) => c.oklch(L, C, H).srgb
const INKS = {
  //            field                 on (ink)              deep                   scheme   spot
  paper:       [[0.94, 0.02, 85],     [0.19, 0.012, 70],    [0.19, 0.012, 70],     'light', 'arch-deep'],
  coral:       [[0.715, 0.16, 34],    [0.18, 0.035, 30],    [0.43, 0.15, 30],      'light', 'on'],
  marigold:    [[0.825, 0.15, 75],    [0.20, 0.03, 70],     [0.415, 0.085, 65],    'light', 'on'],
  rose:        [[0.79, 0.12, 352],    [0.20, 0.04, 345],    [0.42, 0.15, 355],     'light', 'on'],
  sky:         [[0.84, 0.075, 235],   [0.22, 0.05, 245],    [0.41, 0.1, 245],      'light', 'on'],
  peach:       [[0.845, 0.075, 45],   [0.21, 0.035, 40],    [0.42, 0.11, 40],      'light', 'on'],
  lilac:       [[0.78, 0.095, 290],   [0.20, 0.06, 285],    [0.42, 0.15, 290],     'light', 'on'],
  mint:        [[0.86, 0.085, 165],   [0.20, 0.03, 165],    [0.40, 0.08, 160],     'light', 'on'],
  ultramarine: [[0.42, 0.2, 268],     [0.94, 0.02, 85],     [0.42, 0.2, 268],      'dark',  'marigold'],
  forest:      [[0.40, 0.075, 165],   [0.94, 0.02, 85],     [0.40, 0.075, 165],    'dark',  'on'],
  oxblood:     [[0.33, 0.1, 18],      [0.93, 0.03, 60],     [0.33, 0.1, 18],       'dark',  'on'],
  petrol:      [[0.405, 0.065, 215],  [0.94, 0.02, 85],     [0.405, 0.065, 215],   'dark',  'on'],
}
// archetype field + spot pairs (Rewind 5.3)
const ARCH = [['ultramarine', 'marigold'], ['forest', 'mint'], ['peach', 'oxblood'], ['mint', 'ultramarine'], ['rose', 'ultramarine'], ['paper', 'ultramarine-deep'],
  ['petrol', 'marigold'], ['oxblood', 'peach'], ['marigold', 'oxblood'], ['lilac', 'forest'], ['sky', 'ultramarine']]
const paper = o(...INKS.paper[0]), onPaper = o(...INKS.paper[1])
const fails = []
const chk = (label, r, min) => { if (r < min) fails.push(`${label} ${r.toFixed(2)} < ${min}`); return r }
const rows = []
for (const [name, [f, on, deep, scheme, spot]] of Object.entries(INKS)) {
  const F = o(...f), I = o(...on), D = o(...deep)
  const S = spot === 'on' ? I : spot === 'arch-deep' ? null : o(...INKS[spot][0])
  const text = chk(name + ' ink on field', c.contrast(I, F), 7)
  const deepOnPaper = chk(name + ' deep on paper', c.contrast(D, paper), 7)
  // paper spot = the member's archetype deep ink: worst over every deep
  const spotR = S ? c.contrast(S, F) : Math.min(...Object.values(INKS).map(([, , d]) => c.contrast(o(...d), paper)))
  chk(name + ' spot vs field', spotR, 3)
  const minor = c.contrast(c.mix(I, F, 0.4), F) // 1px rule at 40% ink: decorative
  rows.push({ name, scheme, field: c.hex(F), ink: c.hex(I), deep: c.hex(D), text, spotR, spotName: spot, deepOnPaper, minor })
}
const archRows = ARCH.map(([f, s]) => {
  const F = o(...INKS[f][0])
  const S = s.endsWith('-deep') ? o(...INKS[s.replace('-deep', '')][2]) : o(...INKS[s][0])
  const r = chk(`archetype ${f}/${s}`, c.contrast(S, F), 3)
  return [f, s, r]
})
// The previous placeholder contract (fixed light foreground, amber ring, dark-value status) on the light inks and paper
const old = { fg: o(0.97, 0.012, 85), ring: o(0.80, 0.15, 75), warning: o(0.88, 0.13, 102), success: o(0.77, 0.15, 155), info: o(0.77, 0.11, 240), destructive: o(0.74, 0.15, 25) }
const oldRows = ['paper', 'marigold', 'mint', 'sky'].map((n) => { const F = o(...INKS[n][0]); return [n, c.contrast(old.fg, F), c.contrast(old.ring, F)] })
const oldStatus = ['warning', 'success', 'info', 'destructive'].map((k) => [k, c.contrast(old[k], paper)])
const lightStatus = { destructive: o(0.49, 0.19, 27), success: o(0.46, 0.12, 155), warning: o(0.47, 0.1, 85), info: o(0.47, 0.13, 250) }
const lightOnPaper = Object.entries(lightStatus).map(([k, v]) => [k, c.contrast(v, paper), c.contrast(v, c.mix(v, paper, 0.1))])

const md = process.argv.includes('--md')
if (md) {
  console.log('| Ink | Scheme | Field | Ink | Ink on field: text, ink and reverse-out buttons, chips, focus ring, input, switch | Spot vs field | Deep on paper | 40% minor rule |')
  console.log('|---|---|---|---|---|---|---|---|')
  for (const r of rows) console.log(`| ${r.name} | ${r.scheme} | \`${r.field}\` | \`${r.ink}\` | ${r.text.toFixed(2)} | ${r.spotR.toFixed(2)} (${r.spotName}) | ${r.deepOnPaper.toFixed(2)} | ${r.minor.toFixed(2)} |`)
  console.log('\nArchetype spots: ' + archRows.map(([f, s, r]) => `${f}/${s} ${r.toFixed(2)}`).join(', '))
  console.log('\nOld contract on light inks (foreground / ring): ' + oldRows.map(([n, a, b]) => `${n} ${a.toFixed(2)} / ${b.toFixed(2)}`).join(', '))
  console.log('Old dark-value status on paper: ' + oldStatus.map(([k, r]) => `${k} ${r.toFixed(2)}`).join(', '))
  console.log('App light status on paper / on a 10% chip over paper: ' + lightOnPaper.map(([k, a, b]) => `${k} ${a.toFixed(2)} / ${b.toFixed(2)}`).join(', '))
  console.log('Paper popover: on-paper text ' + c.contrast(onPaper, paper).toFixed(2))
}
console.log(fails.length ? 'FAILS:\n' + fails.join('\n') : 'ALL REWIND PAIRS PASS')
module.exports = { INKS }
