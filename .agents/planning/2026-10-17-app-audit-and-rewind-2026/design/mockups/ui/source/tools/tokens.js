// Final token sheet for the Plex Manager app themes (Quiet Precision, final). The Rewind inks are checked by rwcheck.js.
// Usage: node tokens.js [--md] [--json out.json] [--css out.css]
// Computes hex, WCAG contrast for every text pair (including badge tints on every surface),
// non-text contrast, and CVD separation between primary and the status colours.
const fs = require('fs')
const c = require('./color.js')

const H = 255
const T = {
  dark: {
    background: [0.225, 0.005, H], foreground: [0.965, 0.003, H],
    card: [0.252, 0.005, H], 'card-foreground': [0.965, 0.003, H],
    popover: [0.28, 0.006, H], 'popover-foreground': [0.965, 0.003, H],
    primary: [0.79, 0.155, 75], 'primary-hover': [0.83, 0.145, 77], 'primary-foreground': [0.2, 0.03, 65],
    'primary-indicator': [0.79, 0.155, 75], 'primary-indicator-foreground': [0.2, 0.03, 65],
    secondary: [0.305, 0.006, H], 'secondary-hover': [0.34, 0.006, H], 'secondary-foreground': [0.965, 0.003, H],
    muted: [0.275, 0.005, H], 'muted-foreground': [0.76, 0.01, H],
    accent: [0.315, 0.006, H], 'accent-foreground': [0.965, 0.003, H],
    destructive: [0.74, 0.15, 25], 'destructive-foreground': [0.2, 0.04, 25],
    success: [0.77, 0.15, 155], 'success-foreground': [0.2, 0.04, 155],
    warning: [0.88, 0.13, 102], 'warning-foreground': [0.22, 0.04, 95],
    info: [0.77, 0.11, 240], 'info-foreground': [0.2, 0.04, 240],
    border: [0.35, 0.006, H], 'border-strong': [0.44, 0.006, H], input: [0.56, 0.008, H],
    ring: [0.79, 0.155, 75],
    'chart-1': [0.67, 0.14, 70], 'chart-2': [0.62, 0.14, 250], 'chart-3': [0.66, 0.12, 175], 'chart-4': [0.6, 0.16, 305], 'chart-5': [0.66, 0.17, 355],
    sidebar: [0.205, 0.005, H], 'sidebar-foreground': [0.82, 0.006, H],
    'sidebar-primary': [0.79, 0.155, 75], 'sidebar-primary-foreground': [0.2, 0.03, 65],
    'sidebar-accent': [0.275, 0.006, H], 'sidebar-accent-foreground': [0.965, 0.003, H],
    'sidebar-border': [0.3, 0.006, H], 'sidebar-ring': [0.79, 0.155, 75],
  },
  light: {
    background: [0.985, 0.002, H], foreground: [0.2, 0.006, H],
    card: [1, 0, 0], 'card-foreground': [0.2, 0.006, H],
    popover: [1, 0, 0], 'popover-foreground': [0.2, 0.006, H],
    primary: [0.79, 0.155, 75], 'primary-hover': [0.75, 0.155, 72], 'primary-foreground': [0.2, 0.03, 65],
    'primary-indicator': [0.55, 0.12, 62], 'primary-indicator-foreground': [0.985, 0, 0],
    secondary: [0.955, 0.003, H], 'secondary-hover': [0.925, 0.004, H], 'secondary-foreground': [0.2, 0.006, H],
    muted: [0.965, 0.003, H], 'muted-foreground': [0.47, 0.012, H],
    accent: [0.945, 0.004, H], 'accent-foreground': [0.2, 0.006, H],
    destructive: [0.49, 0.19, 27], 'destructive-foreground': [0.985, 0, 0],
    success: [0.46, 0.12, 155], 'success-foreground': [0.985, 0, 0],
    warning: [0.47, 0.1, 85], 'warning-foreground': [0.985, 0, 0],
    info: [0.47, 0.13, 250], 'info-foreground': [0.985, 0, 0],
    border: [0.9, 0.004, H], 'border-strong': [0.84, 0.005, H], input: [0.62, 0.008, H],
    ring: [0.55, 0.12, 62],
    'chart-1': [0.64, 0.135, 62], 'chart-2': [0.55, 0.15, 250], 'chart-3': [0.6, 0.11, 175], 'chart-4': [0.55, 0.18, 305], 'chart-5': [0.6, 0.19, 355],
    sidebar: [0.97, 0.003, H], 'sidebar-foreground': [0.35, 0.008, H],
    'sidebar-primary': [0.55, 0.12, 62], 'sidebar-primary-foreground': [0.985, 0, 0],
    'sidebar-accent': [0.93, 0.004, H], 'sidebar-accent-foreground': [0.2, 0.006, H],
    'sidebar-border': [0.9, 0.004, H], 'sidebar-ring': [0.55, 0.12, 62],
  },
}

const rgb = (v) => c.oklch(...v).srgb
const hx = (v) => c.hex(rgb(v))
const fmt = (v) => `oklch(${+(v[0] * 100).toFixed(1)}% ${v[1]} ${v[2]})`

function machado(srgb, kind) {
  const M = {
    protan: [[0.152286, 1.052583, -0.204868], [0.114503, 0.786281, 0.099216], [-0.003882, -0.048116, 1.051998]],
    deutan: [[0.367322, 0.860646, -0.227968], [0.280085, 0.672501, 0.047413], [-0.01182, 0.04294, 0.968881]],
  }[kind]
  const ung = (x) => (x <= 0.04045 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4))
  const l = srgb.map(ung)
  return M.map((row) => Math.max(0, Math.min(1, row[0] * l[0] + row[1] * l[1] + row[2] * l[2])))
}
function oklabLin([r, g, b]) {
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b)
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b)
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b)
  return [0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s, 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s, 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s]
}
const ung = (x) => (x <= 0.04045 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4))
function dE(a, b, kind) {
  const A = oklabLin(kind ? machado(a, kind) : a.map(ung))
  const B = oklabLin(kind ? machado(b, kind) : b.map(ung))
  return 100 * Math.hypot(A[0] - B[0], A[1] - B[1], A[2] - B[2])
}

const out = []
const fails = []
const P = (s) => out.push(s)
function chk(mode, a, b, ratio, min, note = '') {
  const r = +ratio.toFixed(2)
  if (r < min) fails.push(`${mode}: ${a} on ${b} = ${r} < ${min} ${note}`)
  return r
}

for (const mode of ['dark', 'light']) {
  const t = Object.fromEntries(Object.entries(T[mode]).map(([k, v]) => [k, rgb(v)]))
  P(`\n### ${mode}: text pairs`)
  P('| Text | ' + ['background', 'card', 'popover', 'muted', 'secondary', 'accent', 'sidebar'].join(' | ') + ' |')
  P('|---|' + '---|'.repeat(7))
  for (const fg of ['foreground', 'muted-foreground', 'destructive', 'success', 'warning', 'info', 'sidebar-foreground']) {
    const cells = ['background', 'card', 'popover', 'muted', 'secondary', 'accent', 'sidebar'].map((s) => chk(mode, fg, s, c.contrast(t[fg], t[s]), 4.5).toFixed(2))
    P(`| \`${fg}\` | ${cells.join(' | ')} |`)
  }
  P(`\n### ${mode}: badges (status text on its own tint)`)
  const tint = mode === 'dark' ? 0.14 : 0.1
  P(`Tint ${tint * 100}% fill, composited in sRGB over each surface.`)
  P('| Badge | ' + ['background', 'card', 'popover', 'muted', 'sidebar'].join(' | ') + ' |')
  P('|---|' + '---|'.repeat(5))
  for (const s of ['destructive', 'success', 'warning', 'info']) {
    const cells = ['background', 'card', 'popover', 'muted', 'sidebar'].map((surf) => chk(mode, s + ' badge', surf, c.contrast(t[s], c.mix(t[s], t[surf], tint)), 4.5).toFixed(2))
    P(`| \`${s}\` | ${cells.join(' | ')} |`)
  }
  P(`\n### ${mode}: fills and alerts`)
  P(`| Pair | Ratio |`)
  P(`|---|---|`)
  for (const [a, b] of [['primary-foreground', 'primary'], ['primary-foreground', 'primary-hover'], ['sidebar-primary-foreground', 'sidebar-primary'], ['destructive-foreground', 'destructive'], ['secondary-foreground', 'secondary'], ['secondary-foreground', 'secondary-hover'], ['muted-foreground', 'secondary-hover']]) {
    P(`| \`${a}\` on \`${b}\` | ${chk(mode, a, b, c.contrast(t[a], t[b]), 4.5).toFixed(2)} |`)
  }
  for (const s of ['destructive', 'warning', 'success', 'info']) {
    const al = c.mix(t[s], t.card, 0.08)
    P(`| \`foreground\` / \`muted-foreground\` on ${s} alert (8% on card) | ${chk(mode, 'fg', s + ' alert', c.contrast(t.foreground, al), 4.5).toFixed(2)} / ${chk(mode, 'muted', s + ' alert', c.contrast(t['muted-foreground'], al), 4.5).toFixed(2)} |`)
  }
  P(`\n### ${mode}: non-text (1.4.11)`)
  P('| Token | background | card | popover | muted | sidebar |')
  P('|---|---|---|---|---|---|')
  for (const k of ['input', 'ring', 'primary-indicator', 'sidebar-primary', 'primary', 'border', 'border-strong']) {
    // primary itself is a non-text indicator only in dark (where primary-indicator = primary); in light it is only a button fill whose label carries 9.19:1
    const min = ['input', 'ring', 'sidebar-primary', 'primary-indicator'].includes(k) || (k === 'primary' && mode === 'dark') ? 3 : 0
    const cells = ['background', 'card', 'popover', 'muted', 'sidebar'].map((s) => chk(mode, k, s, c.contrast(t[k], t[s]), min).toFixed(2))
    P(`| \`${k}\` | ${cells.join(' | ')} |`)
  }
  P(`| \`primary-indicator-foreground\` on \`primary-indicator\` (switch thumb, check) | ${chk(mode, 'indicator-fg', 'indicator', c.contrast(t['primary-indicator-foreground'], t['primary-indicator']), 3).toFixed(2)} |`)
  P(`\n### ${mode}: colour-vision separation from primary (OKLab dE x100)`)
  P('| Pair | normal | deutan | protan |')
  P('|---|---|---|---|')
  for (const s of ['warning', 'destructive', 'success', 'chart-1']) {
    P(`| primary vs ${s} | ${dE(t.primary, t[s]).toFixed(1)} | ${dE(t.primary, t[s], 'deutan').toFixed(1)} | ${dE(t.primary, t[s], 'protan').toFixed(1)} |`)
  }
  P(`| destructive vs warning | ${dE(t.destructive, t.warning).toFixed(1)} | ${dE(t.destructive, t.warning, 'deutan').toFixed(1)} | ${dE(t.destructive, t.warning, 'protan').toFixed(1)} |`)
  P(`| success vs warning | ${dE(t.success, t.warning).toFixed(1)} | ${dE(t.success, t.warning, 'deutan').toFixed(1)} | ${dE(t.success, t.warning, 'protan').toFixed(1)} |`)
  P(`| success vs destructive | ${dE(t.success, t.destructive).toFixed(1)} | ${dE(t.success, t.destructive, 'deutan').toFixed(1)} | ${dE(t.success, t.destructive, 'protan').toFixed(1)} |`)
  P(`\nchart hex ${mode}: ` + [1, 2, 3, 4, 5].map((i) => hx(T[mode]['chart-' + i])).join(','))
}


const args = process.argv.slice(2)
if (args.includes('--md')) console.log(out.join('\n'))
console.log(fails.length ? '\nFAILS:\n' + fails.join('\n') : '\nALL PAIRS PASS')
const ji = args.indexOf('--json')
if (ji >= 0) {
  const json = {}
  for (const [mode, t] of Object.entries(T)) json[mode] = Object.fromEntries(Object.entries(t).map(([k, v]) => [k, { oklch: fmt(v), hex: hx(v) }]))
  fs.writeFileSync(args[ji + 1], JSON.stringify(json, null, 1))
}
const ci = args.indexOf('--css')
if (ci >= 0) {
  const blk = (sel, t) => `${sel} {\n` + Object.entries(t).map(([k, v]) => `  --${k}: ${fmt(v)};`).join('\n') + '\n}\n'
  fs.writeFileSync(args[ci + 1], blk(':root', T.dark) + blk('[data-theme="light"]', T.light))
}
module.exports = { T, hx, fmt }

