#!/usr/bin/env node
/**
 * Rewind's motion rule (NFR-6, Rewind design 5.6; plan step P5.2). The
 * design-system check skips Rewind for `infinite-motion`, so this check holds
 * `components/rewind/**`, `lib/rewind/**` and the Rewind block of
 * `app/globals.css` to the stricter rule, and fails on any violation:
 *
 * - `infinite`: an `infinite` animation, `repeat: Infinity`,
 *   `iterationCount: Infinity`, or Tailwind's looping `animate-spin`,
 *   `animate-ping`, `animate-pulse` and `animate-bounce`;
 * - `property`: an animated or transitioned property other than `transform`,
 *   `opacity`, `clip-path` and `font-variation-settings`, in CSS `@keyframes`
 *   and `transition`, in Motion `animate`, `initial`, `exit`, `while*` and
 *   `transition` objects and `animate()` keyframes, in `transition` style
 *   strings, and in Tailwind `transition`, `transition-all`,
 *   `transition-colors`, `transition-shadow` and `transition-[...]` classes;
 * - `font-axis`: a file that animates `font-variation-settings` in more than
 *   one place, because only one font axis may animate at a time.
 *
 *   node scripts/design-system/rewind-motion.mjs     exits 1 on a violation
 *
 * The rule functions are pure and use no `import.meta`, so Jest can load them.
 */

import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import ts from 'typescript'

const CSS_ALLOWED = new Set(['transform', 'opacity', 'clip-path', 'font-variation-settings', 'none'])
const MOTION_ALLOWED = new Set([
  'x', 'y', 'z', 'scale', 'scaleX', 'scaleY', 'rotate', 'rotateX', 'rotateY', 'rotateZ', 'skew', 'skewX', 'skewY',
  'translateX', 'translateY', 'translateZ', 'transform', 'transformOrigin', 'originX', 'originY', 'opacity',
  'clipPath', 'fontVariationSettings', 'transitionEnd',
])
const TIMING_KEYS = new Set([
  'type', 'duration', 'delay', 'ease', 'times', 'repeat', 'repeatType', 'repeatDelay', 'stiffness', 'damping', 'mass',
  'velocity', 'bounce', 'visualDuration', 'restSpeed', 'restDelta', 'when', 'delayChildren', 'staggerChildren',
  'staggerDirection', 'default', 'layout', 'from', 'inherit',
])
const MOTION_PROPS = new Set(['animate', 'initial', 'exit', 'whileHover', 'whileTap', 'whileFocus', 'whileInView', 'whileDrag'])
const INFINITE_KEYS = new Set(['repeat', 'iterationCount', 'iterations'])
const LOOPING_UTILITY = /\banimate-(?:spin|ping|pulse|bounce)\b/
const TAILWIND_TRANSITION = /(?:^|\s)transition(?:-(?:all|colors|shadow))?(?=\s|$)|(?:^|\s)transition-\[([^\]]+)\]/g

const REWIND_BLOCK = /\/\* rewind-scope:start \*\/([\s\S]*?)\/\* rewind-scope:end \*\//

const kebab = (name) => name.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)

/** The properties a CSS `transition` (or `transition-property`) value names. */
function transitionProps(value, shorthand) {
  return value
    .split(',')
    .map((part) => part.trim().split(/\s+/)[0])
    .filter((prop) => prop && (!shorthand || !/^[\d.]/.test(prop)))
}

function cssViolations(css) {
  const found = []
  let fontAxis = 0
  const source = css.replace(/\/\*[\s\S]*?\*\//g, '')
  if (/\binfinite\b/.test(source)) found.push({ rule: 'infinite', detail: 'an infinite CSS animation' })

  for (const match of source.matchAll(/@keyframes\s+([\w-]+)\s*\{/g)) {
    let depth = 1
    let i = match.index + match[0].length
    const start = i
    while (i < source.length && depth > 0) {
      if (source[i] === '{') depth++
      else if (source[i] === '}') depth--
      i++
    }
    const props = new Set([...source.slice(start, i - 1).matchAll(/([a-z-]+)\s*:/g)].map((m) => m[1]))
    for (const prop of props) {
      if (!CSS_ALLOWED.has(prop)) found.push({ rule: 'property', detail: `@keyframes ${match[1]} animates ${prop}` })
    }
    if (props.has('font-variation-settings')) fontAxis++
  }

  for (const match of source.matchAll(/(?:^|[;{\s])transition(-property)?\s*:\s*([^;}]+)/g)) {
    for (const prop of transitionProps(match[2], !match[1])) {
      if (!CSS_ALLOWED.has(prop)) found.push({ rule: 'property', detail: `transition on ${prop}` })
      if (prop === 'font-variation-settings') fontAxis++
    }
  }
  return { found, fontAxis }
}

function propName(node) {
  if (!node.name) return null
  if (ts.isIdentifier(node.name) || ts.isStringLiteral(node.name)) return node.name.text
  return null
}

function visit(node, fn) {
  fn(node)
  ts.forEachChild(node, (child) => visit(child, fn))
}

function tsViolations(path, source) {
  const found = []
  let fontAxis = 0
  const kind = path.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS
  const file = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, false, kind)

  const checkObject = (object, label, allowed) => {
    for (const prop of object.properties) {
      const name = propName(prop)
      if (name === null) continue
      if (!allowed.has(name)) found.push({ rule: 'property', detail: `${label} animates ${name}` })
      if (name === 'fontVariationSettings') fontAxis++
    }
  }

  visit(file, (node) => {
    if (ts.isPropertyAssignment(node)) {
      const name = propName(node)
      if (INFINITE_KEYS.has(name) && ts.isIdentifier(node.initializer) && node.initializer.text === 'Infinity') {
        found.push({ rule: 'infinite', detail: `${name}: Infinity` })
      }
      if ((name === 'transition' || name === 'transitionProperty') && ts.isStringLiteralLike(node.initializer)) {
        for (const prop of transitionProps(node.initializer.text, name === 'transition')) {
          if (!CSS_ALLOWED.has(kebab(prop))) found.push({ rule: 'property', detail: `transition on ${prop}` })
        }
      }
    }
    if (ts.isStringLiteralLike(node)) {
      if (/\binfinite\b/.test(node.text) || LOOPING_UTILITY.test(node.text)) {
        found.push({ rule: 'infinite', detail: `looping class "${node.text}"` })
      }
      for (const match of node.text.matchAll(TAILWIND_TRANSITION)) {
        const props = match[1] ? match[1].split(',') : [match[0].trim()]
        for (const prop of props) {
          if (!CSS_ALLOWED.has(prop)) found.push({ rule: 'property', detail: `Tailwind ${match[0].trim()}` })
        }
      }
    }
    if (ts.isJsxAttribute(node) && ts.isIdentifier(node.name)) {
      const attr = node.name.text
      const expr = node.initializer && ts.isJsxExpression(node.initializer) ? node.initializer.expression : null
      if (!expr || !ts.isObjectLiteralExpression(expr)) return
      if (MOTION_PROPS.has(attr)) checkObject(expr, attr, MOTION_ALLOWED)
      if (attr === 'transition') checkObject(expr, 'transition', new Set([...TIMING_KEYS, ...MOTION_ALLOWED]))
    }
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === 'animate') {
      const keyframes = node.arguments[1]
      if (keyframes && ts.isObjectLiteralExpression(keyframes)) checkObject(keyframes, 'animate()', MOTION_ALLOWED)
    }
  })
  return { found, fontAxis }
}

/** Every violation of the Rewind motion rule in one file. */
export function motionViolations(path, source) {
  let result
  if (path.endsWith('.css')) {
    const block = path === 'app/globals.css' ? (source.match(REWIND_BLOCK)?.[1] ?? '') : source
    result = cssViolations(block)
  } else {
    result = tsViolations(path, source)
  }
  const { found, fontAxis } = result
  if (fontAxis > 1) found.push({ rule: 'font-axis', detail: `font-variation-settings animates in ${fontAxis} places` })
  return found
}

/** The files the rule covers, from git, without tests. */
function rewindFiles(root) {
  return execFileSync('git', ['ls-files', '-co', '--exclude-standard', '--', 'components/rewind', 'lib/rewind'], {
    cwd: root,
    encoding: 'utf8',
  })
    .split('\n')
    .filter((file) => /\.(?:ts|tsx|css)$/.test(file) && !/(?:^|\/)__tests__\/|\.test\.tsx?$|__fixtures__\//.test(file))
    .concat('app/globals.css')
}

function main() {
  const root = process.cwd()
  let failures = 0
  for (const file of rewindFiles(root)) {
    let source
    try {
      source = readFileSync(join(root, file), 'utf8')
    } catch {
      continue
    }
    for (const { rule, detail } of motionViolations(file, source)) {
      failures++
      console.error(`${file}: [${rule}] ${detail}`)
    }
  }
  if (failures > 0) {
    console.error(`rewind-motion: ${failures} violation(s) of NFR-6 (Rewind design 5.6).`)
    process.exit(1)
  }
  console.log('rewind-motion: Rewind animates only transform, opacity, clip-path and one font axis, and nothing loops.')
}

if (process.argv[1]?.endsWith('rewind-motion.mjs')) main()
