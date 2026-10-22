/**
 * Icon codemod: replaces the repeated hand-drawn check, chevron, close and
 * warning SVGs with lucide glyphs through `<Icon>` and the concept map in
 * `lib/ui/icons.ts` (ui-design-system 3.10, plan step P10.15).
 *
 * ## Matching
 *
 * Exact paths only (`PATHS`, whitespace collapsed): an `<svg>` whose one
 * element child is a `path` with a listed `d` (a `<title>` beside it is
 * allowed and becomes the label).
 *
 * ## Rewrite
 *
 * `<svg className="h-5 w-5 text-warning" viewBox="0 0 20 20" aria-hidden="true">`
 * becomes `<Icon icon={icons.warning} size={20} className="text-warning" />`:
 *
 * | Class | Size |
 * |---|---|
 * | `w-3` | 12 |
 * | `w-3.5` | 14 |
 * | `w-4`, or no size class | 16 |
 * | `w-5`, `w-6` | 20 |
 *
 * The drawing attributes (`viewBox`, `fill`, `stroke`, ...) go, `data-*`
 * attributes stay, and the `Icon` and `icons` imports are added. The icon is
 * decorative (`aria-hidden`) unless the SVG carried `aria-label` or a
 * `<title>`, which becomes `label`.
 *
 * ## Review, never rewritten
 *
 * Every other SVG, grouped by path in the review file with a suggested
 * concept where one is known; and a listed path whose SVG has a size,
 * className or attribute the codemod cannot carry over.
 *
 * ## CLI
 *
 * ```sh
 * npm run codemod:icons -- [--slice <paths...>] [--write]
 * ```
 *
 * A dry run over `app/` and `components/` by default; it prints its counts
 * and writes `codemod-icons-review.md` (git-ignored).
 *
 * @module
 */

import ts from 'typescript'

import type { icons } from '@/lib/ui/icons'

import {
  applyEdits,
  attributesOf,
  childElements,
  ensureImport,
  lineOf,
  parseTsx,
  runCli,
  splitSize,
  stringAttribute,
  svgElements,
  type Edit,
  type SvgResult,
  type SvgReview,
} from './svg'

type Concept = keyof typeof icons

/** Exact path data to concept: heroicons v1 outline first, then the 20px solid and v2 forms. */
const PATHS: Record<string, Concept> = {
  'M5 13l4 4L19 7': 'done',
  'M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z':
    'done',
  'M19 9l-7 7-7-7': 'chevronDown',
  'M9 5l7 7-7 7': 'chevronRight',
  'M15 19l-7-7 7-7': 'chevronLeft',
  'M6 18L18 6M6 6l12 12': 'close',
  'M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z':
    'warning',
  'M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 5a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 5zm0 9a1 1 0 100-2 1 1 0 000 2z':
    'warning',
  'M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z':
    'warning',
}

/** Concepts suggested for paths the codemod leaves to a person. */
const SUGGESTIONS: Record<string, Concept> = {
  'M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z': 'info',
  'M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z': 'success',
  'M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z': 'error',
  'M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14': 'externalLink',
  'M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15': 'sync',
  'M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z': 'search',
}

const SIZES: Record<string, 12 | 14 | 16 | 20> = { '3': 12, '3.5': 14, '4': 16, '5': 20, '6': 20 }

/** Attributes that only draw the glyph; lucide draws its own. */
const DRAWING = new Set(['viewBox', 'fill', 'stroke', 'strokeWidth', 'xmlns', 'aria-hidden', 'focusable', 'role'])
const PATH_ATTRIBUTES = new Set(['d', 'fill', 'fillRule', 'clipRule', 'stroke', 'strokeLinecap', 'strokeLinejoin', 'strokeWidth'])

const normalise = (d: string) => d.replace(/\s+/g, ' ').trim()

interface Svg {
  node: ts.JsxElement | ts.JsxSelfClosingElement
  paths: string[]
  /** Set when the SVG is a single listed path. */
  concept?: Concept
  title?: string
  pathAttributesOk: boolean
}

function read(node: ts.JsxElement | ts.JsxSelfClosingElement): Svg {
  const children = childElements(node)
  const paths = children.filter(({ name }) => name === 'path')
  const titles = children.filter(({ name }) => name === 'title')
  const d = paths.map(({ element }) => normalise(stringAttribute(element, 'd') ?? '(expression)'))
  const single = paths.length === 1 && children.length === paths.length + titles.length && titles.length <= 1
  const title = titles[0] && ts.isJsxElement(titles[0].element) ? titles[0].element.children.map((c) => c.getText()).join('').trim() : undefined
  const pathAttributesOk =
    paths.length === 1 &&
    attributesOf(paths[0].element).properties.every(
      (attribute) => ts.isJsxAttribute(attribute) && PATH_ATTRIBUTES.has(attribute.name.getText())
    )
  return { node, paths: d, concept: single ? PATHS[d[0]] : undefined, title: title || undefined, pathAttributesOk }
}

/** The `<Icon>` for a listed SVG, or the reason it goes to review. */
function rewrite(svg: Svg, file: ts.SourceFile): { text: string } | { reason: string } {
  if (!svg.pathAttributesOk) return { reason: 'the path has attributes lucide cannot carry' }
  const kept: string[] = []
  let className = ''
  let label = svg.title
  for (const attribute of attributesOf(svg.node).properties) {
    if (!ts.isJsxAttribute(attribute)) return { reason: 'spread attributes' }
    const name = attribute.name.getText()
    if (DRAWING.has(name)) continue
    if (name.startsWith('data-')) kept.push(attribute.getText(file))
    else if (name === 'className' || name === 'aria-label') {
      const value = stringAttribute(svg.node, name)
      if (typeof value !== 'string') return { reason: `${name} is an expression` }
      if (name === 'className') className = value
      else label = value
    } else return { reason: `the ${name} attribute` }
  }
  const { size, rest } = splitSize(className)
  if (size === undefined) return { reason: 'width and height differ' }
  const pixels = size === null ? 16 : SIZES[size]
  if (!pixels) return { reason: `no Icon size for w-${size}` }
  const classes = rest.filter((token) => token !== 'shrink-0' && token !== 'flex-shrink-0')
  const props = [
    `icon={icons.${svg.concept}}`,
    `size={${pixels}}`,
    ...(classes.length > 0 ? [`className="${classes.join(' ')}"`] : []),
    ...(label ? [`label=${JSON.stringify(label)}`] : []),
    ...kept,
  ]
  return { text: `<Icon ${props.join(' ')} />` }
}

/**
 * Rewrites one file's listed icons. `path` is repo-relative and only names the file.
 *
 * @internal
 */
export function transformIcons(path: string, source: string): SvgResult {
  const file = parseTsx(path, source)
  const edits: Edit[] = []
  const reviews: SvgReview[] = []

  for (const svg of svgElements(file).map(read)) {
    const original = svg.paths.join(' + ') || '(no path)'
    const line = lineOf(file, svg.node)
    if (!svg.concept) {
      const known = svg.paths.length === 1 ? SUGGESTIONS[svg.paths[0]] : undefined
      const suggestion = known ? `icons.${known}` : 'a concept from lib/ui/icons.ts, or keep it as art'
      reviews.push({ file: path, line, original, suggestion, rule: 'unmapped-path' })
      continue
    }
    const result = rewrite(svg, file)
    if ('reason' in result) {
      reviews.push({ file: path, line, original, suggestion: `icons.${svg.concept} by hand: ${result.reason}`, rule: 'held' })
      continue
    }
    edits.push({ start: svg.node.getStart(file), end: svg.node.end, text: result.text })
  }

  if (edits.length === 0) return { output: source, reviews, rewritten: 0 }
  const withIcon = ensureImport(applyEdits(source, edits), 'Icon', '@/components/ui/icon')
  return { output: ensureImport(withIcon, 'icons', '@/lib/ui/icons'), reviews, rewritten: edits.length }
}

/**
 * Runs the CLI; returns the exit code.
 *
 * @internal
 */
export function main(argv: string[], root = process.cwd(), log: (line: string) => void = console.log): number {
  return runCli({ argv, root, log, name: 'Icon codemod', reviewFile: 'codemod-icons-review.md', transform: transformIcons })
}

if (require.main === module) {
  process.exitCode = main(process.argv.slice(2))
}
