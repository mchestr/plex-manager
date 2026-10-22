/**
 * Spinner codemod: replaces hand-drawn spinner SVGs with `<Spinner />`
 * (ui-design-system 9.4, plan step P10.15).
 *
 * ## Matching
 *
 * An `<svg>` matches when one of its `path` children draws the classic
 * spinner arc (`d` starts with `M4 12a8 8 0 018-8V0C5.373`); the faint
 * `circle` track beside it goes too, since the whole SVG is replaced.
 *
 * ## Rewrite
 *
 * `<svg className="animate-spin -ml-1 h-4 w-4 text-white">` becomes
 * `<Spinner className="-ml-1 size-4 text-white" />`: `animate-spin` is
 * dropped (Spinner spins), equal width and height classes become `size-N`,
 * `data-*` attributes are kept, and the Spinner import is added.
 *
 * ## Review, never rewritten
 *
 * - A spinner inside a `button` or `Button`: the button should be
 *   `<Button loading loadingLabel="...">`, which a person words.
 * - A className that is not a plain string, or whose width and height differ.
 *
 * ## CLI
 *
 * ```sh
 * npm run codemod:spinners -- [--slice <paths...>] [--write]
 * ```
 *
 * A dry run over `app/` and `components/` by default; it prints its counts
 * and writes `codemod-spinners-review.md` (git-ignored).
 *
 * @module
 */

import ts from 'typescript'

import {
  ancestorTags,
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

const SPINNER_PATH = 'M4 12a8 8 0 018-8V0C5.373'
const BUTTON_LOADING = '<Button loading loadingLabel="..."> in place of the spinner'

function isSpinner(svg: ts.JsxElement | ts.JsxSelfClosingElement): boolean {
  return childElements(svg).some(
    ({ name, element }) => name === 'path' && stringAttribute(element, 'd')?.startsWith(SPINNER_PATH) === true
  )
}

function dataAttributes(svg: ts.JsxElement | ts.JsxSelfClosingElement, file: ts.SourceFile): string[] {
  return attributesOf(svg)
    .properties.filter((attribute) => ts.isJsxAttribute(attribute) && attribute.name.getText().startsWith('data-'))
    .map((attribute) => attribute.getText(file))
}

/**
 * Rewrites one file's spinners. `path` is repo-relative and only names the file.
 *
 * @internal
 */
export function transformSpinners(path: string, source: string): SvgResult {
  const file = parseTsx(path, source)
  const edits: Edit[] = []
  const reviews: SvgReview[] = []
  const review = (svg: ts.Node, original: string, suggestion: string, rule: string) =>
    reviews.push({ file: path, line: lineOf(file, svg), original, suggestion, rule })

  for (const svg of svgElements(file).filter(isSpinner)) {
    const className = stringAttribute(svg, 'className')
    if (ancestorTags(svg).some((tag) => tag === 'button' || tag === 'Button')) {
      review(svg, className ?? '(no className)', BUTTON_LOADING, 'button-loading')
      continue
    }
    if (className === undefined) {
      review(svg, '(className expression)', '<Spinner className={...} />', 'class-expression')
      continue
    }
    const { size, rest } = splitSize(className ?? '')
    if (size === undefined) {
      review(svg, className ?? '', '<Spinner className="size-N" />, choosing one size', 'size')
      continue
    }
    const classes = [...rest.filter((token) => token !== 'animate-spin'), ...(size ? [`size-${size}`] : [])]
    const attributes = [...(classes.length > 0 ? [`className="${classes.join(' ')}"`] : []), ...dataAttributes(svg, file)]
    edits.push({ start: svg.getStart(file), end: svg.end, text: `<Spinner${attributes.map((a) => ` ${a}`).join('')} />` })
  }

  if (edits.length === 0) return { output: source, reviews, rewritten: 0 }
  const output = ensureImport(applyEdits(source, edits), 'Spinner', '@/components/ui/spinner')
  return { output, reviews, rewritten: edits.length }
}

/**
 * Runs the CLI; returns the exit code.
 *
 * @internal
 */
export function main(argv: string[], root = process.cwd(), log: (line: string) => void = console.log): number {
  return runCli({ argv, root, log, name: 'Spinner codemod', reviewFile: 'codemod-spinners-review.md', transform: transformSpinners })
}

if (require.main === module) {
  process.exitCode = main(process.argv.slice(2))
}
