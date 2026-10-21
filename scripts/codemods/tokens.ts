/**
 * Token codemod: rewrites raw Tailwind palette classes onto the semantic tokens
 * (ui-design-system 9.3, plan step P10.13).
 *
 * ## Overview
 *
 * The pairs live in `token-pairs.ts` as data. An `auto` pair is applied in
 * place; every `review` match is written to `codemod-review.md` (git-ignored,
 * at the repo root) with its file, line, original, suggestion and rule, for a
 * person to resolve in the PR.
 *
 * ## Sources
 *
 * A *unit* is one class context, and the context rule works per unit:
 * - a JSX `className` attribute (string, template, or any `cn()`, `clsx()`,
 *   `twMerge()`, `twJoin()` or `cx()` call, conditional or `&&` inside it);
 * - a class-function call outside an attribute;
 * - the base string of `cva()`.
 *
 * Review only, never rewritten: the variant map of `cva()`, and object
 * literals bound to a name ending in `Classes`, `ClassName` or `classes`,
 * because their keys pair with fills elsewhere.
 *
 * ## Context rule
 *
 * If any class in a unit is a review match (a gradient fill, the
 * `bg-slate-800/50` panel, `bg-cyan-600`, a brand hex, an unmapped palette
 * class), nothing in the unit is rewritten and every string in it that holds a
 * match goes to review, so `text-white` on a coloured fill never becomes
 * `text-foreground` on amber. A fill can also come from the element tree, so
 * `text-white` goes to review (`on-fill`) when its element is a `<Button>`,
 * paints a `style` background, or sits within three elements of a `<Button>`,
 * a `style` background or a className with a coloured fill.
 *
 * ## Classes
 *
 * Variant prefixes (`hover:`, `sm:`, `group-hover:`, `[&>svg]:`), the `!`
 * modifier (either end) and opacity suffixes are kept: `hover:border-slate-700/50`
 * becomes `hover:border-border/50`. A class that touches a template
 * interpolation (`bg-${tone}-500`) is never read. Rewrites only ever produce
 * token classes, so a second run is a no-op.
 *
 * ## CLI
 *
 * ```sh
 * npm run codemod:tokens -- --slice <folder|file|glob> [...more] [--write] [--review-file <path>]
 * ```
 *
 * A dry run by default: prints the auto and review counts per rule and writes
 * only the review file. `--write` rewrites the files too.
 *
 * @module
 */

import { existsSync, globSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { join, relative, sep } from 'node:path'

import ts from 'typescript'

import { SKIP, STRING_RULES, TOKEN_PAIRS, type PairMode } from './token-pairs'

const CLASS_FNS = new Set(['cn', 'clsx', 'twMerge', 'twJoin', 'cx'])
const CLASS_MAP_NAME = /(?:Classes|ClassName|classes)$/
const SOURCE_FILE = /\.[cm]?[jt]sx?$/

export interface ReviewItem {
  file: string
  line: number
  original: string
  suggestion: string
  rule: string
}

export type RuleCounts = Record<string, { auto: number; review: number }>

export interface FileResult {
  output: string
  reviews: ReviewItem[]
  counts: RuleCounts
}

/** One string piece of a class context, as source offsets of its raw text. */
interface Segment {
  start: number
  end: number
  /** The text touches a `${}` at its start or end (template pieces). */
  openStart: boolean
  openEnd: boolean
}

interface Unit {
  segments: Segment[]
  reviewOnly: boolean
  /** A className whose element sits on a coloured fill (see `onFill`). */
  onFill: boolean
}

interface ClassMatch {
  index: number
  rule: string
  mode: PairMode
  /** The new class for an auto match (`''` removes it), or the suggestion. */
  replacement: string
}

interface ParsedClass {
  prefix: string
  utility: string
  bangStart: boolean
  bangEnd: boolean
}

/**
 * Splits `md:hover:!bg-slate-800/50` into its variant prefix, `!` and utility.
 *
 * @internal
 */
export function parseClass(token: string): ParsedClass {
  let depth = 0
  let cut = -1
  for (let i = 0; i < token.length; i++) {
    const char = token[i]
    if (char === '[' || char === '(') depth++
    else if (char === ']' || char === ')') depth--
    else if (char === ':' && depth === 0) cut = i
  }
  const prefix = token.slice(0, cut + 1)
  let utility = token.slice(cut + 1)
  const bangStart = utility.startsWith('!')
  if (bangStart) utility = utility.slice(1)
  const bangEnd = utility.endsWith('!')
  if (bangEnd) utility = utility.slice(0, -1)
  return { prefix, utility, bangStart, bangEnd }
}

function variantsOf(prefix: string): string[] {
  return prefix ? prefix.slice(0, -1).split(':') : []
}

function withUtility(parsed: ParsedClass, utility: string): string {
  return `${parsed.prefix}${parsed.bangStart ? '!' : ''}${utility}${parsed.bangEnd ? '!' : ''}`
}

/** The first pair that matches one class, or null. */
function matchPair(token: string): Omit<ClassMatch, 'index'> | null {
  const parsed = parseClass(token)
  const variants = variantsOf(parsed.prefix)
  for (const pair of TOKEN_PAIRS) {
    if (!pair.match.test(parsed.utility)) continue
    if (pair.variant && !variants.some((variant) => pair.variant?.test(variant))) continue
    if (pair.mode === 'review') return { rule: pair.id, mode: 'review', replacement: pair.replace }
    const utility = parsed.utility.replace(pair.match, pair.replace)
    return { rule: pair.id, mode: 'auto', replacement: utility ? withUtility(parsed, utility) : '' }
  }
  return null
}

const GRADIENT_PART = /^(?:bg-(?:gradient|linear|radial|conic)-.+|(?:from|via|to)-.+|bg-clip-text)$/

/**
 * Finds the pairs in one class string. `parts` alternates whitespace and
 * classes; a class at an open end (touching `${}`) is never matched.
 */
function analyse(parts: string[], segment: Pick<Segment, 'openStart' | 'openEnd'>): ClassMatch[] {
  const classes: number[] = []
  parts.forEach((part, index) => {
    if (!part || /^\s+$/.test(part)) return
    if (index === 0 && segment.openStart) return
    if (index === parts.length - 1 && segment.openEnd) return
    classes.push(index)
  })
  const utilities = new Map(classes.map((index) => [index, parseClass(parts[index]).utility]))
  const has = (test: (utility: string) => boolean) => [...utilities.values()].some(test)
  const matches: ClassMatch[] = []
  const gradientText = has((u) => u === 'bg-clip-text') && has((u) => u === 'text-transparent')
  const eyebrow = has((u) => u === 'uppercase') && has((u) => u.startsWith('tracking-'))

  for (const index of classes) {
    const utility = utilities.get(index) ?? ''
    if (gradientText && (GRADIENT_PART.test(utility) || utility === 'text-transparent')) {
      const replacement = utility === 'text-transparent' ? withUtility(parseClass(parts[index]), 'text-foreground') : ''
      matches.push({ index, rule: 'gradient-text', mode: 'auto', replacement })
      continue
    }
    if (eyebrow && utility === 'uppercase') {
      matches.push({ index, rule: 'eyebrow', mode: 'review', replacement: STRING_RULES.eyebrow.replace })
      continue
    }
    const match = matchPair(parts[index])
    if (match) matches.push({ index, ...match })
  }
  return matches
}

/** Applies auto matches to `parts`; a removed class takes one neighbouring whitespace run with it. */
function apply(parts: string[], matches: ClassMatch[]): string {
  const out = [...parts]
  const dropped = new Set<number>()
  for (const match of matches) {
    if (match.replacement) {
      out[match.index] = match.replacement
      continue
    }
    dropped.add(match.index)
    const next = match.index + 1
    const previous = match.index - 1
    if (next < out.length && /^\s+$/.test(out[next]) && !dropped.has(next)) dropped.add(next)
    else if (previous >= 0 && /^\s+$/.test(out[previous]) && !dropped.has(previous)) dropped.add(previous)
  }
  return out.filter((_, index) => !dropped.has(index)).join('')
}

const split = (text: string) => text.split(/(\s+)/)

/**
 * Rewrites one standalone class string, or returns it unchanged with its
 * review matches when the context rule holds it.
 *
 * @example
 * ```ts
 * rewriteClassString('hover:border-slate-700/50 text-white').text // 'hover:border-border/50 text-foreground'
 * rewriteClassString('bg-cyan-600 text-white').text                // 'bg-cyan-600 text-white' (held for review)
 * ```
 *
 * @internal
 */
export function rewriteClassString(text: string): { text: string; review: boolean } {
  const parts = split(text)
  const matches = analyse(parts, { openStart: false, openEnd: false })
  if (matches.some((match) => match.mode === 'review')) return { text, review: true }
  return { text: apply(parts, matches), review: false }
}

function isClassCall(node: ts.Node): node is ts.CallExpression {
  return ts.isCallExpression(node) && ts.isIdentifier(node.expression) && CLASS_FNS.has(node.expression.text)
}

function isCva(node: ts.Node): node is ts.CallExpression {
  return ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === 'cva'
}

function unwrap(node: ts.Expression): ts.Expression {
  let current = node
  while (ts.isParenthesizedExpression(current) || ts.isAsExpression(current) || ts.isSatisfiesExpression(current)) {
    current = current.expression
  }
  return current
}

/** Collects the class strings of an expression in a class context. */
function collect(node: ts.Expression, file: ts.SourceFile, out: Segment[]): void {
  const expr = unwrap(node)
  if (ts.isStringLiteral(expr) || ts.isNoSubstitutionTemplateLiteral(expr)) {
    out.push({ start: expr.getStart(file) + 1, end: expr.end - 1, openStart: false, openEnd: false })
  } else if (ts.isTemplateExpression(expr)) {
    out.push({ start: expr.head.getStart(file) + 1, end: expr.head.end - 2, openStart: false, openEnd: true })
    for (const span of expr.templateSpans) {
      collect(span.expression, file, out)
      const tail = ts.isTemplateTail(span.literal)
      out.push({
        start: span.literal.getStart(file) + 1,
        end: span.literal.end - (tail ? 1 : 2),
        openStart: true,
        openEnd: !tail,
      })
    }
  } else if (ts.isConditionalExpression(expr)) {
    collect(expr.whenTrue, file, out)
    collect(expr.whenFalse, file, out)
  } else if (ts.isBinaryExpression(expr)) {
    const op = expr.operatorToken.kind
    if (op === ts.SyntaxKind.AmpersandAmpersandToken) collect(expr.right, file, out)
    else if (op === ts.SyntaxKind.BarBarToken || op === ts.SyntaxKind.QuestionQuestionToken) {
      collect(expr.left, file, out)
      collect(expr.right, file, out)
    }
  } else if (ts.isArrayLiteralExpression(expr)) {
    for (const element of expr.elements) collect(element, file, out)
  } else if (ts.isObjectLiteralExpression(expr)) {
    for (const property of expr.properties) {
      if (property.name && ts.isStringLiteral(property.name)) collect(property.name, file, out)
    }
  } else if (isClassCall(expr)) {
    for (const arg of expr.arguments) collect(arg, file, out)
  }
}

/** Every string literal under a node, for the review-only maps. */
function collectAll(node: ts.Node, file: ts.SourceFile, out: Segment[]): void {
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node) || ts.isTemplateExpression(node)) {
    collect(node, file, out)
    return
  }
  ts.forEachChild(node, (child) => collectAll(child, file, out))
}

function isClassMap(node: ts.Node): ts.ObjectLiteralExpression | null {
  const named =
    (ts.isVariableDeclaration(node) || ts.isPropertyAssignment(node)) &&
    node.initializer &&
    (ts.isIdentifier(node.name) || ts.isStringLiteral(node.name)) &&
    CLASS_MAP_NAME.test(node.name.text)
  if (!named || !node.initializer) return null
  const value = unwrap(node.initializer)
  return ts.isObjectLiteralExpression(value) ? value : null
}

const NEUTRAL_STOP = /^(?:from|via|to)-(?:slate|gray|zinc|neutral|stone|black|transparent)\b/
const TOKEN_FILL = /^bg-(?:primary|destructive|success|warning|info)(?:\/\d{1,3})?$/
const FILL_RULES = new Set(['cta-fill', 'arbitrary-color', 'raw-palette'])

/** True when a class string paints a coloured fill: a palette or brand fill, a token fill, or a coloured gradient. */
function paintsFill(text: string): boolean {
  const utilities = split(text).map((part) => parseClass(part).utility)
  const gradient = utilities.some((u) => /^bg-(?:gradient|linear|radial|conic)-/.test(u))
  return utilities.some((utility) => {
    if (TOKEN_FILL.test(utility)) return true
    if (gradient && /^(?:from|via|to)-/.test(utility) && !NEUTRAL_STOP.test(utility)) return true
    if (!utility.startsWith('bg-') || /^bg-(?:white|black)/.test(utility)) return false
    const match = matchPair(utility)
    return match !== null && FILL_RULES.has(match.rule)
  })
}

/** True for `style={{ background… }}`, which paints a fill the class strings can't show. */
function paintsStyleFill(attribute: ts.JsxAttribute): boolean {
  const value = attribute.initializer
  if (!value || !ts.isJsxExpression(value) || !value.expression) return false
  const style = unwrap(value.expression)
  return (
    ts.isObjectLiteralExpression(style) &&
    style.properties.some(
      (property) => property.name !== undefined && ts.isIdentifier(property.name) && /^background/.test(property.name.text)
    )
  )
}

const FILL_DEPTH = 3

/**
 * True when the element that owns a className is a `<Button>` or sits within
 * three elements of one, or of an element whose className paints a coloured
 * fill. `text-white` there is the fill's foreground, never `text-foreground`.
 */
function onFill(attribute: ts.JsxAttribute, file: ts.SourceFile): boolean {
  let node: ts.Node = attribute.parent.parent
  let depth = 0
  while (node && depth <= FILL_DEPTH) {
    const opening = ts.isJsxElement(node)
      ? node.openingElement
      : ts.isJsxSelfClosingElement(node) || ts.isJsxOpeningElement(node)
        ? node
        : null
    if (opening) {
      if (opening.tagName.getText(file) === 'Button') return true
      for (const property of opening.attributes.properties) {
        if (!ts.isJsxAttribute(property) || !ts.isIdentifier(property.name)) continue
        if (property.name.text === 'style' && paintsStyleFill(property)) return true
        // The owner's own className is the unit itself, which the context rule covers.
        if (property.name.text !== 'className' || depth === 0) continue
        const segments: Segment[] = []
        const value = property.initializer
        if (value && ts.isStringLiteral(value)) collect(value, file, segments)
        else if (value && ts.isJsxExpression(value) && value.expression) collect(value.expression, file, segments)
        if (segments.some((segment) => paintsFill(file.text.slice(segment.start, segment.end)))) return true
      }
      if (ts.isJsxElement(node) || ts.isJsxSelfClosingElement(node)) depth++
    }
    node = node.parent
  }
  return false
}

function units(file: ts.SourceFile): Unit[] {
  const found: Unit[] = []
  const add = (reviewOnly: boolean, fill: (out: Segment[]) => void, filled = false) => {
    const segments: Segment[] = []
    fill(segments)
    if (segments.length > 0) found.push({ segments, reviewOnly, onFill: filled })
  }
  const visit = (node: ts.Node): void => {
    if (ts.isJsxAttribute(node) && ts.isIdentifier(node.name) && node.name.text === 'className') {
      const init = node.initializer
      const filled = onFill(node, file)
      if (init && ts.isStringLiteral(init)) add(false, (out) => collect(init, file, out), filled)
      else if (init && ts.isJsxExpression(init) && init.expression) {
        const expression = init.expression
        add(false, (out) => collect(expression, file, out), filled)
      }
      return
    }
    if (isClassCall(node)) {
      add(false, (out) => node.arguments.forEach((arg) => collect(arg, file, out)))
      return
    }
    if (isCva(node)) {
      const [base, config] = node.arguments
      if (base) add(false, (out) => collect(base, file, out))
      if (config) add(true, (out) => collectAll(config, file, out))
      return
    }
    const map = isClassMap(node)
    if (map) {
      add(true, (out) => collectAll(map, file, out))
      return
    }
    ts.forEachChild(node, visit)
  }
  visit(file)
  return found
}

const compact = (text: string) => text.replace(/\s+/g, ' ').trim()

function suggestionFor(parts: string[], matches: ClassMatch[], held: boolean): string {
  return matches
    .map((match) => {
      const replacement = match.mode === 'auto' ? match.replacement || '(remove)' : match.replacement
      return `${parts[match.index]}: ${replacement}${held && match.mode === 'auto' ? ' (auto, held)' : ''}`
    })
    .join('; ')
}

function scriptKind(path: string): ts.ScriptKind {
  if (path.endsWith('.tsx')) return ts.ScriptKind.TSX
  if (path.endsWith('.jsx')) return ts.ScriptKind.JSX
  return /\.[cm]?js$/.test(path) ? ts.ScriptKind.JS : ts.ScriptKind.TS
}

/**
 * Rewrites one file's source. `path` is repo-relative and only names the file.
 *
 * @internal
 */
export function transformSource(path: string, source: string): FileResult {
  const file = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true, scriptKind(path))
  const edits: { start: number; end: number; text: string }[] = []
  const reviews: ReviewItem[] = []
  const counts: RuleCounts = {}
  const count = (rule: string, mode: PairMode) => {
    counts[rule] ??= { auto: 0, review: 0 }
    counts[rule][mode]++
  }

  for (const unit of units(file)) {
    const analysed = unit.segments.map((segment) => {
      const parts = split(source.slice(segment.start, segment.end))
      const matches = analyse(parts, segment).map((match) =>
        unit.onFill && match.rule === 'text-foreground' && parseClass(parts[match.index]).utility.startsWith('text-white')
          ? { ...match, rule: 'on-fill', mode: 'review' as const, replacement: STRING_RULES['on-fill'].replace }
          : match
      )
      return { segment, parts, matches }
    })
    const held = unit.reviewOnly || analysed.some(({ matches }) => matches.some((match) => match.mode === 'review'))
    for (const { segment, parts, matches } of analysed) {
      if (matches.length === 0) continue
      if (!held) {
        matches.forEach((match) => count(match.rule, 'auto'))
        edits.push({ start: segment.start, end: segment.end, text: apply(parts, matches) })
        continue
      }
      matches.forEach((match) => count(match.rule, 'review'))
      const rules = [...new Set(matches.map((match) => match.rule))]
      reviews.push({
        file: path,
        line: file.getLineAndCharacterOfPosition(segment.start).line + 1,
        original: compact(parts.join('')),
        suggestion: suggestionFor(parts, matches, true),
        rule: unit.reviewOnly ? ['class-map', ...rules].join(', ') : rules.join(', '),
      })
    }
  }

  let output = source
  for (const edit of edits.sort((a, b) => b.start - a.start)) {
    output = output.slice(0, edit.start) + edit.text + output.slice(edit.end)
  }
  return { output, reviews, counts }
}

const cell = (text: string) => text.replace(/\|/g, '\\|')

/**
 * The `codemod-review.md` table.
 *
 * @internal
 */
export function formatReview(items: ReviewItem[]): string {
  const lines = [
    '# Token codemod review',
    '',
    'Generated by `scripts/codemods/tokens.ts` (ui-design-system 9.3). Resolve every item in the PR:',
    'apply it, or keep it with a reason.',
    '',
  ]
  if (items.length === 0) return [...lines, 'No review items.', ''].join('\n')
  lines.push('| File | Line | Original | Suggestion | Rule |', '|---|---|---|---|---|')
  for (const item of items) {
    lines.push(
      `| ${cell(item.file)} | ${item.line} | \`${cell(item.original)}\` | ${cell(item.suggestion)} | ${cell(item.rule)} |`
    )
  }
  return [...lines, ''].join('\n')
}

const toPosix = (path: string) => path.split(sep).join('/')

/**
 * True for paths the codemod never touches (`SKIP`).
 *
 * @internal
 */
export function isSkipped(path: string): boolean {
  return SKIP.some((pattern) => pattern.test(path))
}

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    if (name === 'node_modules' || name === '.next' || name === 'generated') return []
    const path = join(dir, name)
    return statSync(path).isDirectory() ? walk(path) : [path]
  })
}

/**
 * Expands `--slice` arguments (folders, files or globs) to repo-relative source files.
 *
 * @internal
 */
export function resolveSlices(slices: string[], root: string): string[] {
  const files = slices.flatMap((slice) => {
    const absolute = join(root, slice)
    if (existsSync(absolute)) return statSync(absolute).isDirectory() ? walk(absolute) : [absolute]
    return globSync(slice, { cwd: root }).map((path) => join(root, path))
  })
  return [...new Set(files.map((path) => toPosix(relative(root, path))))]
    .filter((path) => SOURCE_FILE.test(path) && !isSkipped(path))
    .sort()
}

interface CliOptions {
  slices: string[]
  write: boolean
  reviewFile: string
}

function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = { slices: [], write: false, reviewFile: 'codemod-review.md' }
  let inSlice = false
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (arg === '--write') options.write = true
    else if (arg === '--review-file') options.reviewFile = argv[++i] ?? options.reviewFile
    else if (arg === '--slice') inSlice = true
    else if (arg.startsWith('--slice=')) options.slices.push(arg.slice('--slice='.length))
    else if (inSlice && !arg.startsWith('--')) options.slices.push(arg)
    else throw new Error(`Unknown argument: ${arg}`)
  }
  return options
}

/**
 * Runs the CLI; returns the exit code.
 *
 * @internal
 */
export function main(argv: string[], root = process.cwd(), log: (line: string) => void = console.log): number {
  let options: CliOptions
  try {
    options = parseArgs(argv)
  } catch (error) {
    log(String(error))
    return 2
  }
  if (options.slices.length === 0) {
    log('Usage: tokens.ts --slice <folder|file|glob> [...more] [--write] [--review-file <path>]')
    return 2
  }

  const totals: RuleCounts = {}
  const reviews: ReviewItem[] = []
  const changed: string[] = []
  const files = resolveSlices(options.slices, root)
  for (const path of files) {
    const absolute = join(root, path)
    const source = readFileSync(absolute, 'utf8')
    const result = transformSource(path, source)
    reviews.push(...result.reviews)
    for (const [rule, { auto, review }] of Object.entries(result.counts)) {
      totals[rule] ??= { auto: 0, review: 0 }
      totals[rule].auto += auto
      totals[rule].review += review
    }
    if (result.output !== source) {
      changed.push(path)
      if (options.write) writeFileSync(absolute, result.output)
    }
  }
  writeFileSync(join(root, options.reviewFile), formatReview(reviews))

  log(`${options.write ? 'Rewrote' : 'Would rewrite'} ${changed.length} of ${files.length} files`)
  for (const [rule, { auto, review }] of Object.entries(totals).sort(([a], [b]) => a.localeCompare(b))) {
    log(`  ${rule.padEnd(20)} auto ${String(auto).padStart(5)}   review ${String(review).padStart(5)}`)
  }
  if (options.write) changed.forEach((path) => log(`  changed ${path}`))
  log(`${reviews.length} review items in ${options.reviewFile}`)
  return 0
}

if (require.main === module) {
  process.exitCode = main(process.argv.slice(2))
}
