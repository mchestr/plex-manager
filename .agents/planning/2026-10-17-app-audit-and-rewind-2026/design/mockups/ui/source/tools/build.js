// Build self-contained mockups: inline tokens + base.css + lucide icons + original poster art.
// Usage: node build.js  (reads ../src/*.html, writes the planning design/mockups/ui/*.html)
const fs = require('fs')
const path = require('path')
const ROOT = path.resolve(__dirname, '..') // source/: src partials + tools
const SRC = path.join(ROOT, 'src')
const OUT = '/home/user/plex-manager/.agents/planning/2026-10-17-app-audit-and-rewind-2026/design/mockups/ui'
const ICONS = '/home/user/plex-manager/node_modules/lucide-react/dist/esm/icons'

// ---------- lucide icons (ISC), inlined from the repo's installed lucide-react ----------
const cache = {}
function icon(name, cls = '') {
  if (!cache[name]) {
    const file = path.join(ICONS, name + '.mjs')
    if (!fs.existsSync(file)) throw new Error('missing icon ' + name)
    let src = fs.readFileSync(file, 'utf8')
    const alias = src.match(/export \{ default \} from '\.\/([a-z0-9-]+)\.mjs'/)
    if (alias) src = fs.readFileSync(path.join(ICONS, alias[1] + '.mjs'), 'utf8')
    const m = src.match(/const __iconNode = (\[[\s\S]*?\]);\n/)
    const node = Function('"use strict";return (' + m[1] + ')')()
    cache[name] = node.map(([tag, attrs]) => `<${tag} ${Object.entries(attrs).filter(([k]) => k !== 'key').map(([k, v]) => `${k}="${v}"`).join(' ')}/>`).join('')
  }
  return `<svg class="i ${cls}" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${cache[name]}</svg>`
}

// ---------- original poster art (flat compositions, invented titles) ----------
const T = (txt, { x = 16, y = 270, size = 26, fill = '#f4ede0', anchor = 'start', w = 78, weight = 650, ls = -0.5 } = {}) =>
  txt.split('|').map((line, i, a) => `<text x="${x}" y="${y - (a.length - 1 - i) * size * 0.98}" font-family="IBM Plex Sans" font-size="${size}" font-weight="${weight}" letter-spacing="${ls}" style="font-stretch:${w}%" fill="${fill}" text-anchor="${anchor}">${line}</text>`).join('')
const POSTERS = {
  ember: () => `<rect width="200" height="300" fill="#6f241b"/><circle cx="100" cy="128" r="62" fill="#e0673a"/><path d="M100 70 C125 110 132 140 100 190 C68 140 75 110 100 70Z" fill="#2b0f0b"/><rect y="214" width="200" height="86" fill="#4a160f"/>${T('Ember|Hours', { y: 280, size: 34, fill: '#f6dcc4' })}`,
  tide: () => `<rect width="200" height="300" fill="#174148"/><circle cx="100" cy="150" r="54" fill="#e9a94b"/><rect y="150" width="200" height="150" fill="#0f2f35"/>${[0, 1, 2, 3, 4].map((i) => `<rect x="${40 + i * 6}" y="${162 + i * 12}" width="${120 - i * 12}" height="3" fill="#e9a94b" opacity="${0.8 - i * 0.14}"/>`).join('')}${T('The Long|Tide', { y: 62, size: 28, fill: '#f3e6cf' })}`,
  saltmarsh: () => `<rect width="200" height="300" fill="#56663a"/><rect y="196" width="200" height="104" fill="#3a4728"/>${Array.from({ length: 14 }, (_, i) => `<rect x="${14 + i * 13}" y="${120 + ((i * 37) % 60)}" width="2" height="${90 - ((i * 37) % 60)}" fill="#cfd59f" opacity=".8"/>`).join('')}${T('Saltmarsh', { y: 52, size: 30, fill: '#eef0d0' })}`,
  northbound: () => `<rect width="200" height="300" fill="#d3e0e8"/><path d="M0 210 L60 130 L100 180 L150 110 L200 175 L200 300 L0 300Z" fill="#f7fafc"/><path d="M0 230 L200 230 L200 300 L0 300Z" fill="#26364a"/><rect x="40" y="214" width="34" height="14" rx="2" fill="#26364a"/><rect x="80" y="214" width="34" height="14" rx="2" fill="#26364a"/><rect x="120" y="214" width="34" height="14" rx="2" fill="#26364a"/>${T('Northbound', { y: 56, size: 28, fill: '#26364a' })}`,
  glasshouse: () => `<rect width="200" height="300" fill="#143429"/><g stroke="#4f8a6e" stroke-width="2" fill="none"><path d="M30 250 L30 140 L100 90 L170 140 L170 250Z"/><path d="M30 175 L170 175 M30 212 L170 212 M65 115 L65 250 M100 90 L100 250 M135 115 L135 250"/></g><ellipse cx="100" cy="196" rx="20" ry="36" fill="#7fc39b" transform="rotate(-24 100 196)"/>${T('Glasshouse', { y: 282, size: 26, fill: '#d9efe1' })}`,
  nightshift: () => `<rect width="200" height="300" fill="#191c38"/>${[[24, 120, '#cf4f8f'], [52, 84, '#3fb5c4'], [80, 140, '#7a5fd0'], [108, 96, '#cf4f8f'], [136, 70, '#3fb5c4'], [164, 118, '#7a5fd0']].map(([x, h, f]) => `<rect x="${x}" y="${246 - h}" width="18" height="${h}" fill="${f}"/>`).join('')}<rect y="246" width="200" height="54" fill="#11132a"/>${T('Night Shift', { y: 56, size: 30, fill: '#ece9ff' })}`,
  moons: () => `<rect width="200" height="300" fill="#3a2446"/><circle cx="62" cy="120" r="30" fill="#f1e4c8"/><circle cx="128" cy="96" r="18" fill="#f1e4c8" opacity=".7"/><circle cx="140" cy="172" r="40" fill="#f1e4c8" opacity=".9"/><circle cx="128" cy="166" r="40" fill="#3a2446"/>${T('Paper|Moons', { y: 282, size: 30, fill: '#f1e4c8' })}`,
  kestrel: () => `<rect width="200" height="300" fill="#c7962c"/><path d="M28 170 L100 128 L172 170 L100 150Z" fill="#1d1a14"/><path d="M92 146 L100 196 L108 146Z" fill="#1d1a14"/>${T('KESTREL', { x: 100, y: 70, size: 34, fill: '#1d1a14', anchor: 'middle', ls: 3, w: 75 })}`,
  lowseason: () => `<rect width="200" height="300" fill="#f2b9a1"/><rect y="170" width="200" height="40" fill="#5aa7b4"/><rect y="210" width="200" height="90" fill="#efd9a8"/><path d="M60 196 A44 30 0 0 1 148 196Z" fill="#d6463a"/><rect x="103" y="196" width="3" height="58" fill="#4a2b22"/>${T('Low|Season', { y: 76, size: 32, fill: '#3a1e18' })}`,
  cartographer: () => `<rect width="200" height="300" fill="#dacca9"/><g fill="none" stroke="#3b372e" stroke-width="2">${[16, 32, 48, 64].map((r) => `<ellipse cx="100" cy="140" rx="${r * 1.2}" ry="${r}"/>`).join('')}</g><circle cx="108" cy="134" r="5" fill="#b13c2a"/>${T('The|Cartographer', { y: 276, size: 24, fill: '#2d2a22' })}`,
  orchard: () => `<rect width="200" height="300" fill="#86a173"/><path d="M0 200 Q60 150 120 190 T200 170 L200 300 L0 300Z" fill="#5d7a4c"/><path d="M0 240 Q80 200 200 236 L200 300 L0 300Z" fill="#3f5a33"/>${[[40, 170], [72, 160], [150, 166], [176, 158], [110, 182]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="9" fill="#2f4526"/>`).join('')}${T('Orchard|Road', { y: 82, size: 30, fill: '#f4f1df' })}`,
  machines: () => `<rect width="200" height="300" fill="#b7a8da"/><circle cx="70" cy="124" r="24" fill="#2a2440"/><circle cx="130" cy="124" r="24" fill="#2a2440"/><circle cx="76" cy="118" r="7" fill="#e9e3ff"/><circle cx="136" cy="118" r="7" fill="#e9e3ff"/><rect x="70" y="168" width="60" height="6" rx="3" fill="#2a2440"/>${T('Quiet|Machines', { y: 270, size: 30, fill: '#2a2440' })}`,
  harbor: () => `<rect width="200" height="300" fill="#132029"/>${[30, 54, 80, 112, 140, 168].map((x, i) => `<rect x="${x}" y="${150 + (i % 3) * 10}" width="3" height="${110 - (i % 3) * 18}" fill="#e7a84a" opacity="${0.5 + (i % 2) * 0.4}"/>`).join('')}<rect y="250" width="200" height="50" fill="#0c151c"/>${T('Harbor|Lights', { y: 82, size: 30, fill: '#f4e2c2' })}`,
  understudy: () => `<rect width="200" height="300" fill="#761d2b"/><ellipse cx="100" cy="226" rx="70" ry="16" fill="#f3dcc0" opacity=".9"/><circle cx="100" cy="150" r="16" fill="#2a0c12"/><path d="M76 222 Q100 160 124 222Z" fill="#2a0c12"/>${T('The|Understudy', { y: 74, size: 28, fill: '#f3dcc0' })}`,
  static: () => `<rect width="200" height="300" fill="#202826"/><g stroke="#9fd6b6" stroke-width="2" fill="none">${[0, 1, 2, 3, 4, 5].map((i) => `<path d="M100 170 Q${60 + i * 16} ${110 - i * 6} 100 ${92 + i * 4}"/>`).join('')}</g><circle cx="100" cy="170" r="10" fill="#e8846b"/>${T('Static|Bloom', { y: 276, size: 30, fill: '#e3f3ea' })}`,
  secondunit: () => `<rect width="200" height="300" fill="#3d3f44"/><rect x="34" y="120" width="132" height="86" fill="#1c1d20"/><g fill="#efefe8">${[0, 1, 2, 3, 4].map((i) => `<path d="M${34 + i * 28} 104 L${54 + i * 28} 104 L${42 + i * 28} 120 L${22 + i * 28} 120Z"/>`).join('')}</g>${T('Second|Unit', { y: 268, size: 30, fill: '#efefe8' })}`,
  fen: () => `<rect width="200" height="300" fill="#9fb3b8"/><rect y="168" width="200" height="132" fill="#56707a"/><path d="M0 168 L200 168" stroke="#e8eef0" stroke-width="2"/><rect x="128" y="120" width="10" height="48" fill="#2b3a40"/><path d="M118 124 L148 124 L133 104Z" fill="#2b3a40"/>${T('Fen|Country', { y: 76, size: 30, fill: '#1f2b30' })}`,
  arcade: () => `<rect width="200" height="300" fill="#0f3b5c"/><g fill="none" stroke="#f0c454" stroke-width="3">${[0, 1, 2].map((i) => `<path d="M${40 + i * 40} 230 L${40 + i * 40} 150 A20 20 0 0 1 ${80 + i * 40} 150 L${80 + i * 40} 230"/>`).join('')}</g>${T('Arcade|Summer', { y: 82, size: 30, fill: '#fbe9b8' })}`,
}
function poster(key) {
  if (!POSTERS[key]) throw new Error('missing poster ' + key)
  return `<svg viewBox="0 0 200 300" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid slice" aria-hidden="true">${POSTERS[key]()}</svg>`
}

// ---------- optical soundtrack (Rewind 5.7): one step-area path, mirrored on a centre line ----------
// {{soundtrack:daily}} 1 Jan to 30 Nov in-app daily columns, December dotted; {{soundtrack:empty}} pre-season dotted line
function soundtrack(kind) {
  const W = 730, H = 96, mid = H / 2, days = 365, through = 334
  const dotted = (x0) => `<line x1="${x0}" y1="${mid}" x2="${W}" y2="${mid}" stroke="currentColor" stroke-width="1.5" stroke-dasharray="1.5 4" stroke-linecap="round"/>`
  if (kind === 'empty') return `<svg class="st" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-hidden="true">${dotted(0)}</svg>`
  let seed = 7
  const rnd = () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296 }
  const mins = []
  for (let d = 0; d < through; d++) {
    const wd = (d + 4) % 7, weekend = wd === 5 || wd === 6
    const season = 0.65 + 0.35 * Math.sin((d / 365) * Math.PI * 2 + 1.2)
    let m = (weekend ? 150 : 70) * season * (0.35 + rnd() * 1.1)
    if (rnd() < 0.12) m = 0
    if (d > 200 && d < 212) m *= 2.2 // a binge in late July
    mins.push(m)
  }
  const max = Math.max(...mins), dx = W / days
  let top = `M0 ${mid}`, bot = ''
  mins.forEach((m, d) => { const h = Math.sqrt(m / max) * (mid - 2); top += ` L${(d * dx).toFixed(1)} ${(mid - h).toFixed(1)} L${((d + 1) * dx).toFixed(1)} ${(mid - h).toFixed(1)}` })
  for (let d = mins.length - 1; d >= 0; d--) { const h = Math.sqrt(mins[d] / max) * (mid - 2); bot += ` L${((d + 1) * dx).toFixed(1)} ${(mid + h).toFixed(1)} L${(d * dx).toFixed(1)} ${(mid + h).toFixed(1)}` }
  return `<svg class="st" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-hidden="true"><path d="${top}${bot} Z" fill="currentColor"/>${dotted(through * dx + 3)}</svg>`
}

// ---------- partials ----------
function part(name, vars = {}) {
  let s = fs.readFileSync(path.join(SRC, '_' + name + '.part'), 'utf8')
  for (const [k, v] of Object.entries(vars)) s = s.split('%' + k + '%').join(v)
  return s
}

const tokens = fs.readFileSync(path.join(__dirname, 'tokens.css'), 'utf8')
const css = fs.readFileSync(path.join(SRC, 'base.css'), 'utf8').replace('/*TOKENS*/', tokens)
fs.mkdirSync(OUT, { recursive: true })
const only = process.argv[2]
for (const f of fs.readdirSync(SRC).filter((f) => f.endsWith('.html') && (!only || f.startsWith(only)))) {
  let html = fs.readFileSync(path.join(SRC, f), 'utf8')
  html = html.replace('/*BASE_CSS*/', css)
  html = html.replace(/<!--SIDEBAR:([a-z-]+)-->/g, (_, active) => {
    let s = part('sidebar')
    for (const key of ['users', 'settings', 'invites']) {
      const on = key === active
      s = s.replace(`%${key.toUpperCase()}%`, on ? 'on' : '').replace(`%${key.toUpperCase()}_CUR%`, on ? 'aria-current="page"' : '')
    }
    return s
  })
  html = html.replace(/<!--PART:([a-z-]+)(?::([^>]*))?-->/g, (_, n, args) => {
    const vars = {}
    if (args) for (const kv of args.split(';')) { const i = kv.indexOf('='); vars[kv.slice(0, i)] = kv.slice(i + 1) }
    return part(n, vars)
  })
  html = html.replace(/\{\{poster:([a-z]+)\}\}/g, (_, k) => poster(k))
  html = html.replace(/\{\{soundtrack:([a-z]+)\}\}/g, (_, k) => soundtrack(k))
  html = html.replace(/\{\{i:([a-z0-9-]+)(?::([^}]*))?\}\}/g, (_, n, c) => icon(n, c || ''))
  fs.writeFileSync(path.join(OUT, f), html)
  console.log('built', f, (html.length / 1024).toFixed(1) + 'KB')
}
