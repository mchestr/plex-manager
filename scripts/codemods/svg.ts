/**
 * Shared pieces of the spinner and icon codemods (plan step P10.15): finding
 * inline `<svg>` elements, reading their attributes, adding imports, and the
 * dry-run CLI both scripts share.
 *
 * Built on the TypeScript compiler API, like `tokens.ts`. Both codemods use
 * the token codemod's skip list, plus the paths where inline SVG is art
 * (Rewind and drawn charts) that the `inline-svg` design rule allows.
 *
 * @module
 */

import { readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

import ts from 'typescript'

import { resolveSlices } from './tokens'

/** Inline SVG here is art, not an icon (the `inline-svg` rule's allowlist). */
const SVG_ART: readonly RegExp[] = [
  /^components\/rewind\//,
  /^app\/\(app\)\/rewind\//,
  /^lib\/rewind\//,
  /^components\/ui\/chart/,
  /(?:^|\/)charts?\//,
]

export interface SvgReview {
  file: string
  line: number
  /** What the codemod found, such as the path `d` or the spinner's className. */
  original: string
  suggestion: string
  rule: string
}

export interface SvgResult {
  output: string
  reviews: SvgReview[]
  /** Rewritten SVGs. */
  rewritten: number
}

export interface Edit {
  start: number
  end: number
  text: string
}

export function parseTsx(path: string, source: string): ts.SourceFile {
  const kind = path.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS
  return ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true, kind)
}

const tagName = (node: ts.JsxElement | ts.JsxSelfClosingElement) =>
  (ts.isJsxElement(node) ? node.openingElement.tagName : node.tagName).getText()

export const attributesOf = (node: ts.JsxElement | ts.JsxSelfClosingElement) =>
  ts.isJsxElement(node) ? node.openingElement.attributes : node.attributes

/** Every plain `<svg>` element (`motion.svg` is animation, never matched). */
export function svgElements(file: ts.SourceFile): (ts.JsxElement | ts.JsxSelfClosingElement)[] {
  const found: (ts.JsxElement | ts.JsxSelfClosingElement)[] = []
  const visit = (node: ts.Node) => {
    if ((ts.isJsxElement(node) || ts.isJsxSelfClosingElement(node)) && tagName(node) === 'svg') {
      found.push(node)
      return
    }
    ts.forEachChild(node, visit)
  }
  visit(file)
  return found
}

/** The child elements of an SVG, by tag name. */
export function childElements(node: ts.JsxElement | ts.JsxSelfClosingElement) {
  if (!ts.isJsxElement(node)) return []
  return node.children.filter((child): child is ts.JsxElement | ts.JsxSelfClosingElement =>
    ts.isJsxElement(child) || ts.isJsxSelfClosingElement(child)
  ).map((element) => ({ name: tagName(element), element }))
}

/**
 * One attribute's string value: `null` when absent, `undefined` when it is an
 * expression the codemod cannot read.
 */
export function stringAttribute(node: ts.JsxElement | ts.JsxSelfClosingElement, name: string): string | null | undefined {
  for (const attribute of attributesOf(node).properties) {
    if (!ts.isJsxAttribute(attribute) || attribute.name.getText() !== name) continue
    const init = attribute.initializer
    if (init && ts.isStringLiteral(init)) return init.text
    if (init && ts.isJsxExpression(init) && init.expression && ts.isStringLiteral(init.expression)) {
      return init.expression.text
    }
    return undefined
  }
  return null
}

/** The nearest enclosing JSX element names, innermost first. */
export function ancestorTags(node: ts.Node): string[] {
  const tags: string[] = []
  for (let parent = node.parent; parent; parent = parent.parent) {
    if (ts.isJsxElement(parent)) tags.push(tagName(parent))
  }
  return tags
}

const SIZE_CLASS = /^(?:w|h|size)-(\d+(?:\.5)?)$/

/**
 * Splits a className into its size (`w-4 h-4`, `h-4 w-4` or `size-4` give `4`)
 * and the other classes. `size` is `null` without a size class and
 * `undefined` when width and height differ.
 */
export function splitSize(className: string): { size: string | null | undefined; rest: string[] } {
  const sizes = new Set<string>()
  const rest: string[] = []
  for (const token of className.split(/\s+/).filter(Boolean)) {
    const match = SIZE_CLASS.exec(token)
    if (match) sizes.add(match[1])
    else rest.push(token)
  }
  if (sizes.size > 1) return { size: undefined, rest }
  return { size: sizes.size === 1 ? [...sizes][0] : null, rest }
}

/** Adds `import { name } from 'from'` after the last import, in the file's quote style. */
export function ensureImport(source: string, name: string, from: string): string {
  const file = parseTsx('file.tsx', source)
  const imports = file.statements.filter(ts.isImportDeclaration)
  for (const statement of imports) {
    if (!ts.isStringLiteral(statement.moduleSpecifier) || statement.moduleSpecifier.text !== from) continue
    const bindings = statement.importClause?.namedBindings
    if (!bindings || !ts.isNamedImports(bindings)) continue
    if (bindings.elements.some((element) => element.name.text === name)) return source
    const last = bindings.elements[bindings.elements.length - 1]
    return `${source.slice(0, last.end)}, ${name}${source.slice(last.end)}`
  }
  const quote = imports[0]?.moduleSpecifier.getText().startsWith("'") ? "'" : '"'
  const line = `import { ${name} } from ${quote}${from}${quote}`
  if (imports.length === 0) {
    const directive = file.statements[0]
    const isDirective =
      directive && ts.isExpressionStatement(directive) && ts.isStringLiteral(directive.expression)
    return isDirective
      ? `${source.slice(0, directive.end)}\n\n${line}${source.slice(directive.end)}`
      : `${line}\n${source}`
  }
  const end = imports[imports.length - 1].end
  return `${source.slice(0, end)}\n${line}${source.slice(end)}`
}

export function applyEdits(source: string, edits: Edit[]): string {
  let output = source
  for (const edit of [...edits].sort((a, b) => b.start - a.start)) {
    output = output.slice(0, edit.start) + edit.text + output.slice(edit.end)
  }
  return output
}

export function lineOf(file: ts.SourceFile, node: ts.Node): number {
  return file.getLineAndCharacterOfPosition(node.getStart(file)).line + 1
}

/** True for paths the SVG codemods never touch. */
function isSvgArt(path: string): boolean {
  return SVG_ART.some((pattern) => pattern.test(path))
}

const cell = (text: string) => text.replace(/\\/g, '\\\\').replace(/\|/g, '\\|')

/** A review table, grouped by the `original` column (the path for icons). */
function formatSvgReview(title: string, items: SvgReview[]): string {
  const lines = [`# ${title}`, '', 'Resolve each item in the PR, or leave it listed for its P10 page step.', '']
  if (items.length === 0) return [...lines, 'No review items.', ''].join('\n')
  lines.push('| Original | File | Line | Suggestion | Rule |', '|---|---|---|---|---|')
  const sorted = [...items].sort((a, b) => a.original.localeCompare(b.original) || a.file.localeCompare(b.file))
  for (const item of sorted) {
    lines.push(`| \`${cell(item.original)}\` | ${cell(item.file)} | ${item.line} | ${cell(item.suggestion)} | ${item.rule} |`)
  }
  return [...lines, ''].join('\n')
}

const DEFAULT_SLICES = ['app', 'components']

/**
 * The shared CLI: `[--slice <paths...>] [--write] [--review-file <path>]`,
 * a dry run over `app/` and `components/` by default. Returns the exit code.
 */
export function runCli(options: {
  argv: string[]
  root: string
  log: (line: string) => void
  name: string
  reviewFile: string
  transform: (path: string, source: string) => SvgResult
}): number {
  const { argv, root, log } = options
  const slices: string[] = []
  let write = false
  let reviewFile = options.reviewFile
  let inSlice = false
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (arg === '--write') write = true
    else if (arg === '--review-file') reviewFile = argv[++i] ?? reviewFile
    else if (arg === '--slice') inSlice = true
    else if (inSlice && !arg.startsWith('--')) slices.push(arg)
    else {
      log(`Unknown argument: ${arg}`)
      return 2
    }
  }

  const files = resolveSlices(slices.length > 0 ? slices : DEFAULT_SLICES, root).filter((path) => !isSvgArt(path))
  const reviews: SvgReview[] = []
  const changed: string[] = []
  let rewritten = 0
  for (const path of files) {
    const absolute = join(root, path)
    const source = readFileSync(absolute, 'utf8')
    const result = options.transform(path, source)
    reviews.push(...result.reviews)
    rewritten += result.rewritten
    if (result.output === source) continue
    changed.push(path)
    if (write) writeFileSync(absolute, result.output)
  }
  writeFileSync(resolve(root, reviewFile), formatSvgReview(`${options.name} review`, reviews))
  log(`${write ? 'Rewrote' : 'Would rewrite'} ${rewritten} SVGs in ${changed.length} of ${files.length} files`)
  if (write) changed.forEach((path) => log(`  changed ${path}`))
  log(`${reviews.length} review items in ${reviewFile}`)
  return 0
}
