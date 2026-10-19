/**
 * The two design-system rules that need the TypeScript AST instead of a regex
 * over the raw source (ui-design-system 9.6, plan step P1.8).
 *
 * - `jsxTexts` returns the visible copy of each JSX element: its direct
 *   `JsxText` children and string-literal children (`{'->'}`), joined in order,
 *   so `Next{' '}{'->'}` reads as `Next ->`. Identifiers and attributes are
 *   never copy, so `<WrappedViewer>` and `wrappedId` are not counted.
 * - `styleLiterals` returns every string literal inside a `style={{...}}`
 *   object, where hex colours bypass the token system.
 *
 * No `import.meta`, so Jest's SWC transform can load this file.
 */

import ts from 'typescript'

/** A few entities that stand for the characters the copy rule looks for. */
const ENTITIES = { '&rarr;': '→', '&middot;': '·', '&gt;': '>', '&nbsp;': ' ' }

function decode(text) {
  return text.replace(/&(?:rarr|middot|gt|nbsp);/g, (entity) => ENTITIES[entity])
}

function stringValue(node) {
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return node.text
  return null
}

function parse(path, source) {
  const kind = path.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS
  return ts.createSourceFile(path, source, ts.ScriptTarget.Latest, false, kind)
}

function visit(node, fn) {
  fn(node)
  ts.forEachChild(node, (child) => visit(child, fn))
}

/** The joined copy of every JSX element and fragment in the file. */
export function jsxTexts(path, source) {
  const texts = []
  visit(parse(path, source), (node) => {
    if (!ts.isJsxElement(node) && !ts.isJsxFragment(node)) return
    let text = ''
    for (const child of node.children) {
      if (ts.isJsxText(child)) text += decode(child.text)
      else if (ts.isJsxExpression(child) && child.expression) {
        text += stringValue(child.expression) ?? ''
      }
    }
    if (text.trim()) texts.push(text)
  })
  return texts
}

/** Every string literal inside a `style={{...}}` object literal. */
export function styleLiterals(path, source) {
  const literals = []
  visit(parse(path, source), (node) => {
    if (!ts.isJsxAttribute(node) || !ts.isIdentifier(node.name) || node.name.text !== 'style') return
    const init = node.initializer
    if (!init || !ts.isJsxExpression(init) || !init.expression) return
    if (!ts.isObjectLiteralExpression(init.expression)) return
    visit(init.expression, (inner) => {
      const value = stringValue(inner)
      if (value !== null) literals.push(value)
    })
  })
  return literals
}
