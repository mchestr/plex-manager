/**
 * The design-system rules of ui-design-system 9.6 and the per-file counter
 * behind `scripts/check-design-system.mjs` (plan steps P1.8 and P10.11).
 *
 * Each rule is `{ id, description, pattern | count, scope?, allow?, ast? }`:
 * - `pattern` is a global regex counted over the raw source, unless `ast`
 *   says which AST text it runs over instead (`'jsx-text'`), or adds a second
 *   AST pass (`{ target: 'style', pattern }`) on top of the raw count;
 * - `count(source)` replaces `pattern` for a rule about the whole file;
 * - `scope(path)` returns false for paths the rule skips;
 * - `allow` lists exact paths where the rule is not counted.
 *
 * Rewind is not exempt from NFR-6: P5.2 adds a Rewind-scoped motion check for
 * the paths `rewind-only` and `infinite-motion` skip here.
 *
 * Pure functions with no `import.meta`, so Jest's SWC transform can load it.
 */

import { jsxTexts, styleLiterals } from './ast.mjs'

const sortKeys = (object) => Object.fromEntries(Object.entries(object).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)))

const PALETTE =
  'slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose'
const PREFIXES =
  'bg|text|border|ring|from|via|to|fill|stroke|outline|divide|placeholder|shadow|decoration|caret|accent'

const REWIND_PATHS = ['app/(app)/rewind/', 'components/rewind/', 'lib/rewind/']
const outsideRewind = (path) => !REWIND_PATHS.some((prefix) => path.startsWith(prefix))

/** Inline SVG is allowed for drawn charts and Rewind art; icons come from lucide (P10.15). */
const SVG_ART = [/^components\/ui\/chart/, /(?:^|\/)charts?\//]
const outsideSvgArt = (path) => outsideRewind(path) && !SVG_ART.some((re) => re.test(path))

/** A `'use client'` directive as the module's first statement. */
const CLIENT_DIRECTIVE = /^(?:\s|\/\/[^\n]*\n|\/\*[\s\S]*?\*\/)*['"]use client['"]/
/**
 * What makes a module need the client: hooks, handlers, browser globals,
 * motion, or an element `render` prop (a Base UI trigger merges its children
 * into that element, which a Server Component parent drops).
 */
const CLIENT_NEEDS = /\buse[A-Z]\w*|\bon[A-Z]\w*=|\b(?:window|document)\.|\bmotion\b|\brender=\{</

/**
 * A `'use client'` marker on a module with none of {@link CLIENT_NEEDS}: a
 * render-only leaf that can be a Server Component (P10.7, BP-32). A function
 * prop passed down (a render prop, a className callback) also needs the
 * client, which the heuristic cannot see; such files keep a count.
 */
function unneededClientMarker(source) {
  return CLIENT_DIRECTIVE.test(source) && !CLIENT_NEEDS.test(source.replace(CLIENT_DIRECTIVE, '')) ? 1 : 0
}

/** The Rewind block of `app/globals.css` (P3.1 adds the markers). */
const REWIND_BLOCK = /\/\* rewind-scope:start \*\/[\s\S]*?\/\* rewind-scope:end \*\//g

export const RULES = [
  {
    id: 'raw-palette',
    description: 'Raw Tailwind palette utilities instead of semantic tokens',
    pattern: new RegExp(`\\b(?:${PREFIXES})-(?:(?:${PALETTE})-\\d{2,3}|white|black)(?:\\/\\d{1,3})?\\b`, 'g'),
  },
  { id: 'gradient', description: 'Gradient backgrounds', pattern: /\bbg-(?:gradient|linear|radial|conic)-/g },
  { id: 'gradient-text', description: 'Gradient text', pattern: /\bbg-clip-text\b|\btext-transparent\b/g },
  {
    id: 'arbitrary-color',
    description: 'Arbitrary colours, and hex literals in style={{}}',
    pattern: /\[(?:#[0-9a-fA-F]{3,8}|rgba?\(|hsla?\()/g,
    ast: { target: 'style', pattern: /#[0-9a-fA-F]{3,8}\b/g },
  },
  {
    id: 'arbitrary-type-z',
    description: 'Arbitrary type sizes, tracking and z-index',
    pattern: /\btext-\[\d+px\]|\btracking-\[|\bz-\[\d+\]/g,
  },
  // P6.3 adds the member top bar to `allow` when it creates it.
  { id: 'blur', description: 'Backdrop blur', pattern: /\bbackdrop-blur/g, allow: [] },
  { id: 'caps-eyebrow', description: 'Uppercase tracked eyebrows', pattern: /\buppercase\b[^"']*\btracking-/g },
  {
    id: 'infinite-motion',
    description: 'Infinite motion outside Rewind (animate-spin and animate-skeleton stay allowed)',
    pattern: /repeat:\s*Infinity|animate-(?:bounce|ping|pulse)\b/g,
    scope: outsideRewind,
  },
  {
    id: 'rewind-only',
    description: 'Rewind-only tokens, fonts and Button variants outside Rewind',
    pattern: /--(?:rw-|field\b|ink\b|spot\b|deep\b|arch-)|\bfont-(?:display|text)\b|variant="ink(?:-outline)?"|size="(?:icon-)?pill"/g,
    // The primitives sheet draws the Rewind-only Button entries in its ink panels (P3.7).
    scope: (path) => outsideRewind(path) && !path.startsWith('app/dev/'),
  },
  {
    id: 'copy',
    description: 'Arrows, middots, "Wrapped" and "Plex Rewind" in JSX copy',
    pattern: /\s(?:->|→)\s*$|\s·\s|\bWrapped\b|Plex Rewind/g,
    ast: 'jsx-text',
  },
  { id: 'zoom-lock', description: 'Viewport zoom lock', pattern: /maximumScale|userScalable/g },
  {
    id: 'inline-spinner',
    description: 'Hand-drawn spinner SVGs instead of Spinner or Button loading',
    pattern: /M4 12a8 8 0 018-8V0C5\.373/g,
  },
  {
    id: 'inline-svg',
    description: 'Inline <svg> outside charts and Rewind art; icons render through Icon',
    pattern: /<svg\b/g,
    scope: outsideSvgArt,
  },
  {
    id: 'client-marker',
    description: "'use client' on a module with no hooks, handlers, browser APIs or motion",
    count: unneededClientMarker,
    // Next requires error boundaries to be client components
    scope: (path) => /\.tsx?$/.test(path) && !/(?:^|\/)(?:global-)?error\.tsx$/.test(path),
  },
]

function countIn(pattern, texts) {
  return texts.reduce((sum, text) => sum + (text.match(pattern)?.length ?? 0), 0)
}

/** Counts every rule in one file. Only non-zero counts appear, keys sorted. */
export function countFile(path, source) {
  const jsx = /\.tsx?$/.test(path)
  const counts = {}
  for (const rule of RULES) {
    if (rule.scope && !rule.scope(path)) continue
    if (rule.allow?.includes(path)) continue
    const raw = rule.scope ? source.replace(REWIND_BLOCK, '') : source
    let n
    if (rule.count) n = rule.count(source)
    else if (rule.ast === 'jsx-text') n = jsx ? countIn(rule.pattern, jsxTexts(path, source)) : 0
    else {
      n = countIn(rule.pattern, [raw])
      if (rule.ast && jsx) n += countIn(rule.ast.pattern, styleLiterals(path, source))
    }
    if (n > 0) counts[rule.id] = n
  }
  return sortKeys(counts)
}

/** Per-rule totals across files, keys sorted. */
export function totals(files) {
  const sums = {}
  for (const counts of Object.values(files)) {
    for (const [rule, n] of Object.entries(counts)) sums[rule] = (sums[rule] ?? 0) + n
  }
  return sortKeys(sums)
}
