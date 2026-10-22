/**
 * Adapter codemod: moves call sites off the ui-design-system 9.4 adapters
 * onto the primitives they render (plan step P10.11), so the adapters can go.
 *
 * ## Automatic
 *
 * Elements are matched by where their tag is imported from, never by name
 * alone, so a `tone` on some other component is left alone.
 *
 * | Adapter | Rewrite |
 * |---|---|
 * | `Button` | `variant` `danger` to `destructive`, `success` to `secondary`; `size` `md` to `default` |
 * | `Badge` | `tone` to `variant` (`danger` to `destructive`); an explicit `variant` wins |
 * | `Alert` | `tone="danger"` to `tone="destructive"` |
 * | `Card padding` | the children move into `<CardContent className="p-N ...">`, which takes the old `className` |
 * | `LoadingSpinner` | `<Spinner size={12/16/20/24}>`, `label` kept |
 * | `StyledInput`, `StyledTextarea` | `Input`, `Textarea`: `size` and `resize` become classes, `error` becomes `aria-invalid`, and the `setup-input-<name>` test id is written out |
 * | `StyledCheckbox` | `Checkbox`, `onChange={(e) => f(e.target.checked)}` to `onCheckedChange={(checked) => f(checked)}` |
 * | `ModalShell` | `Dialog`, `isOpen` to `open`, `onClose` to `onOpenChange` |
 *
 * ## Review
 *
 * Written to `codemod-review.md` (git-ignored) for hand edits:
 * `StyledDropdown` (its options become the composed Select), `ConfirmModal`
 * (ConfirmDialog with an async `action`), `LoadingScreen` (a route skeleton),
 * a `ModalShell`'s body (DialogContent, DialogTitle), and any prop the
 * codemod cannot read (an expression where it needs a string).
 *
 * ## CLI
 *
 * ```sh
 * npm run codemod:adapters -- [--slice <paths...>] [--write]
 * ```
 *
 * A dry run over `app/` and `components/` by default. A second run is a no-op.
 *
 * @module
 */

import ts from 'typescript'

import { applyEdits, attributesOf, ensureImport, lineOf, parseTsx, runCli, type Edit, type SvgResult, type SvgReview } from './svg'

type Jsx = ts.JsxElement | ts.JsxSelfClosingElement

const UI = '@/components/ui/'

/** Adapters a person moves by hand, with what each becomes. */
const STRUCTURAL: Record<string, string> = {
  [`${UI}styled-dropdown#StyledDropdown`]: 'Select with SelectTrigger, SelectValue, SelectContent and one SelectItem per option',
  '@/components/admin/shared/confirm-modal#ConfirmModal': 'ConfirmDialog with an async action (useActionDialog)',
  [`${UI}loading-screen#LoadingScreen`]: 'the route skeleton (loading.tsx) for this page',
}

const BUTTON_VARIANTS: Record<string, string> = { danger: 'destructive', success: 'secondary' }
const CARD_PADDING: Record<string, string> = { none: 'p-0', sm: 'p-4', md: 'p-6', lg: 'p-8' }
const SPINNER_SIZES: Record<string, number> = { sm: 12, md: 16, lg: 20, xl: 24 }
const INPUT_SIZES: Record<string, string> = { sm: 'h-8', md: '', lg: 'h-11 md:text-body' }
const TEXTAREA_SIZES: Record<string, string> = { sm: 'py-1.5', md: '', lg: 'py-2.5 md:text-body' }
const RESIZE: Record<string, string> = { none: 'resize-none', vertical: 'resize-y', horizontal: 'resize-x', both: 'resize' }

/** `local name -> "module#imported"` for every named import. */
function importsOf(file: ts.SourceFile): Map<string, string> {
  const map = new Map<string, string>()
  for (const statement of file.statements) {
    if (!ts.isImportDeclaration(statement) || !ts.isStringLiteral(statement.moduleSpecifier)) continue
    const bindings = statement.importClause?.namedBindings
    if (!bindings || !ts.isNamedImports(bindings)) continue
    for (const element of bindings.elements) {
      map.set(element.name.text, `${statement.moduleSpecifier.text}#${(element.propertyName ?? element.name).text}`)
    }
  }
  return map
}

const opening = (node: Jsx) => (ts.isJsxElement(node) ? node.openingElement : node)
const tagOf = (node: Jsx) => opening(node).tagName.getText()

function jsxElements(file: ts.SourceFile): Jsx[] {
  const found: Jsx[] = []
  const visit = (node: ts.Node) => {
    if (ts.isJsxElement(node) || ts.isJsxSelfClosingElement(node)) found.push(node)
    ts.forEachChild(node, visit)
  }
  visit(file)
  return found
}

function attribute(node: Jsx, name: string): ts.JsxAttribute | undefined {
  return attributesOf(node).properties.find(
    (prop): prop is ts.JsxAttribute => ts.isJsxAttribute(prop) && prop.name.getText() === name
  )
}

/** A string attribute's value; `undefined` when absent, `null` when it is an expression. */
function literal(attr: ts.JsxAttribute | undefined): string | null | undefined {
  if (!attr) return undefined
  const init = attr.initializer
  if (init && ts.isStringLiteral(init)) return init.text
  if (init && ts.isJsxExpression(init) && init.expression && ts.isStringLiteralLike(init.expression)) return init.expression.text
  return null
}

const expressionText = (attr: ts.JsxAttribute, file: ts.SourceFile) => {
  const init = attr.initializer
  if (init && ts.isJsxExpression(init) && init.expression) return init.expression.getText(file)
  return init ? init.getText(file) : 'true'
}

const classes = (...parts: (string | undefined)[]) => parts.filter(Boolean).join(' ').trim()

/** Rewrites one file. `path` is repo-relative and only names the file. */
export function transformAdapters(path: string, source: string): SvgResult {
  const file = parseTsx(path, source)
  const imports = importsOf(file)
  const edits: Edit[] = []
  const reviews: SvgReview[] = []
  const added: [name: string, from: string][] = []
  let rewritten = 0

  const review = (node: ts.Node, original: string, suggestion: string, rule: string) =>
    reviews.push({ file: path, line: lineOf(file, node), original, suggestion, rule })
  const replace = (node: ts.Node, text: string) => edits.push({ start: node.getStart(file), end: node.end, text })
  const remove = (attr: ts.JsxAttribute) => edits.push({ start: attr.getFullStart(), end: attr.end, text: '' })
  /** Renames the opening and closing tag. */
  const rename = (node: Jsx, to: string) => {
    replace(opening(node).tagName, to)
    if (ts.isJsxElement(node)) replace(node.closingElement.tagName, to)
  }

  for (const node of jsxElements(file)) {
    const tag = tagOf(node)
    const origin = imports.get(tag)
    if (!origin) continue

    if (origin in STRUCTURAL) {
      review(node, `<${tag}>`, STRUCTURAL[origin], 'structural')
      continue
    }

    if (origin === `${UI}button#Button`) {
      const variant = attribute(node, 'variant')
      const next = BUTTON_VARIANTS[literal(variant) ?? '']
      const size = attribute(node, 'size')
      const md = size !== undefined && literal(size) === 'md'
      if (variant && next) replace(variant, `variant="${next}"`)
      if (size && md) replace(size, 'size="default"')
      if ((variant && next) || md) rewritten++
    } else if (origin === `${UI}badge#Badge`) {
      const tone = attribute(node, 'tone')
      if (!tone) continue
      const value = literal(tone)
      if (value === null) {
        review(tone, tone.getText(file), 'variant={...} (danger is destructive)', 'expression')
        continue
      }
      if (attribute(node, 'variant')) remove(tone)
      else replace(tone, `variant="${value === 'danger' ? 'destructive' : value}"`)
      rewritten++
    } else if (origin === `${UI}alert#Alert`) {
      const tone = attribute(node, 'tone')
      if (!tone || literal(tone) !== 'danger') continue
      replace(tone, 'tone="destructive"')
      rewritten++
    } else if (origin === `${UI}card#Card`) {
      const padding = attribute(node, 'padding')
      if (!padding) continue
      const value = literal(padding)
      const className = attribute(node, 'className')
      const extra = literal(className)
      if (!value || extra === null || !ts.isJsxElement(node)) {
        review(padding, opening(node).getText(file), 'compose CardContent with the padding class', 'expression')
        continue
      }
      remove(padding)
      if (className) remove(className)
      // Two inserts rather than one replacement, so edits inside the body still apply.
      const inner = classes(CARD_PADDING[value], extra)
      edits.push({ start: node.openingElement.end, end: node.openingElement.end, text: `<CardContent className="${inner}">` })
      edits.push({ start: node.closingElement.getStart(file), end: node.closingElement.getStart(file), text: '</CardContent>' })
      added.push(['CardContent', `${UI}card`])
      rewritten++
    } else if (origin === `${UI}loading-spinner#LoadingSpinner`) {
      const size = attribute(node, 'size')
      const value = size ? literal(size) : 'md'
      if (!value || !(value in SPINNER_SIZES)) {
        review(node, opening(node).getText(file), '<Spinner size={...} />', 'expression')
        continue
      }
      if (size) replace(size, `size={${SPINNER_SIZES[value]}}`)
      else edits.push({ start: opening(node).tagName.end, end: opening(node).tagName.end, text: ` size={${SPINNER_SIZES[value]}}` })
      rename(node, 'Spinner')
      added.push(['Spinner', `${UI}spinner`])
      rewritten++
    } else if (origin === `${UI}styled-input#StyledInput` || origin === `${UI}styled-textarea#StyledTextarea`) {
      const textarea = origin.endsWith('StyledTextarea')
      const size = attribute(node, 'size')
      const resize = attribute(node, 'resize')
      const className = attribute(node, 'className')
      const [sizeValue, resizeValue, classValue] = [literal(size), literal(resize), literal(className)]
      const sizes = textarea ? TEXTAREA_SIZES : INPUT_SIZES
      if (sizeValue === null || resizeValue === null || (sizeValue !== undefined && !(sizeValue in sizes))) {
        review(node, opening(node).getText(file), `${textarea ? 'Textarea' : 'Input'} with the size as classes`, 'expression')
        continue
      }
      const extra = classes(sizes[sizeValue ?? 'md'], textarea ? RESIZE[resizeValue ?? 'vertical'] : undefined)
      if (extra && classValue === null) {
        review(node, opening(node).getText(file), `cn("${extra}", className)`, 'expression')
        continue
      }
      if (size) remove(size)
      if (resize) remove(resize)
      const merged = classes(extra, classValue ?? undefined)
      if (className) replace(className, merged ? `className="${merged}"` : '')
      else if (merged) edits.push({ start: opening(node).tagName.end, end: opening(node).tagName.end, text: ` className="${merged}"` })
      const error = attribute(node, 'error')
      if (error) replace(error, error.initializer ? `aria-invalid={${expressionText(error, file)} || undefined}` : 'aria-invalid')
      const name = literal(attribute(node, 'name'))
      if (!attribute(node, 'data-testid') && name) {
        edits.push({ start: opening(node).tagName.end, end: opening(node).tagName.end, text: ` data-testid="setup-input-${name}"` })
      }
      const to = textarea ? 'Textarea' : 'Input'
      rename(node, to)
      added.push([to, `${UI}${to.toLowerCase()}`])
      rewritten++
    } else if (origin === `${UI}styled-checkbox#StyledCheckbox`) {
      const onChange = attribute(node, 'onChange')
      const handler = onChange?.initializer && ts.isJsxExpression(onChange.initializer) ? onChange.initializer.expression : undefined
      if (onChange) {
        const param = handler && ts.isArrowFunction(handler) && handler.parameters.length === 1 ? handler.parameters[0].name.getText(file) : undefined
        const body = handler && ts.isArrowFunction(handler) ? handler.body.getText(file) : ''
        const read = `${param}.target.checked`
        if (!param || !body.includes(read) || body.replaceAll(read, '').match(new RegExp(`\\b${param}\\b`))) {
          review(onChange, onChange.getText(file), 'onCheckedChange={(checked) => ...}', 'expression')
          continue
        }
        replace(onChange, `onCheckedChange={(checked) => ${body.replaceAll(read, 'checked')}}`)
      }
      rename(node, 'Checkbox')
      added.push(['Checkbox', `${UI}checkbox`])
      rewritten++
    } else if (origin === `${UI}modal-shell#ModalShell`) {
      const isOpen = attribute(node, 'isOpen')
      const onClose = attribute(node, 'onClose')
      if (isOpen) replace(isOpen.name, 'open')
      if (onClose) {
        const close = expressionText(onClose, file)
        const call = /^[\w.]+$/.test(close) ? `${close}()` : `(${close})()`
        replace(onClose, `onOpenChange={(open) => { if (!open) ${call} }}`)
      }
      rename(node, 'Dialog')
      added.push(['Dialog', `${UI}dialog`])
      review(node, '<ModalShell>', 'wrap the body in DialogContent with DialogTitle; maxWidth and labelledBy go there', 'structural')
      rewritten++
    }
  }

  if (edits.length === 0) return { output: source, reviews, rewritten: 0 }
  let output = applyEdits(source, edits)
  for (const [name, from] of added) output = ensureImport(output, name, from)
  return { output: dropUnusedImports(output, imports), reviews, rewritten }
}

const ADAPTER_IMPORTS = new Set([
  `${UI}loading-spinner#LoadingSpinner`,
  `${UI}styled-input#StyledInput`,
  `${UI}styled-textarea#StyledTextarea`,
  `${UI}styled-checkbox#StyledCheckbox`,
  `${UI}modal-shell#ModalShell`,
])

/** Drops the adapter imports that no longer have a use in the file. */
function dropUnusedImports(source: string, imports: Map<string, string>): string {
  let output = source
  for (const [local, from] of imports) {
    if (!ADAPTER_IMPORTS.has(from)) continue
    const file = parseTsx('file.tsx', output)
    const uses = output.match(new RegExp(`\\b${local}\\b`, 'g'))?.length ?? 0
    if (uses > 1) continue
    const statement = file.statements.find(
      (s) => ts.isImportDeclaration(s) && ts.isStringLiteral(s.moduleSpecifier) && s.moduleSpecifier.text === from.split('#')[0]
    )
    if (!statement) continue
    const bindings = (statement as ts.ImportDeclaration).importClause?.namedBindings
    if (bindings && ts.isNamedImports(bindings) && bindings.elements.length > 1) continue
    const end = output[statement.end] === '\n' ? statement.end + 1 : statement.end
    output = output.slice(0, statement.getStart(file)) + output.slice(end)
  }
  return output
}

/**
 * Runs the CLI; returns the exit code.
 *
 * @internal
 */
export function main(argv: string[], root = process.cwd(), log: (line: string) => void = console.log): number {
  return runCli({ argv, root, log, name: 'Adapter codemod', unit: 'elements', reviewFile: 'codemod-review.md', transform: transformAdapters })
}

if (require.main === module) {
  process.exitCode = main(process.argv.slice(2))
}
