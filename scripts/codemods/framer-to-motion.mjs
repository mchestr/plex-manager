#!/usr/bin/env node
/**
 * framer-motion to motion codemod (plan step P2.15).
 *
 * Rewrites the module specifier `framer-motion` to `motion/react` and changes
 * nothing else, so every file keeps its own named imports:
 *
 *   import { motion } from "framer-motion"      ->  import { motion } from "motion/react"
 *   import type { Variants } from 'framer-motion' ->  import type { Variants } from 'motion/react'
 *   export { motion } from "framer-motion"        ->  export { motion } from "motion/react"
 *   jest.mock('framer-motion', () => ...)         ->  jest.mock('motion/react', () => ...)
 *
 *   node scripts/codemods/framer-to-motion.mjs   rewrites app/, components/, lib/, hooks/,
 *                                                test/, e2e/ and jest.setup.js, printing each changed file
 */

import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const FROM = 'framer-motion'
const TO = 'motion/react'

// `from '…'` ends an import or re-export (type-only or not); a bare `import '…'`
// is a side-effect import; jest.mock/doMock/requireActual/requireMock name a module.
const SPECIFIER = new RegExp(
  String.raw`(\bfrom\s*|\bimport\s*|\bjest\.(?:mock|doMock|unmock|requireActual|requireMock)\(\s*)(['"])${FROM}\2`,
  'g'
)

/** Returns `source` with every `framer-motion` specifier pointing at `motion/react`. */
export function rewrite(source) {
  return source.replace(SPECIFIER, (_match, lead, quote) => `${lead}${quote}${TO}${quote}`)
}

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const DIRS = ['app', 'components', 'lib', 'hooks', 'test', 'e2e']
const FILES = ['jest.setup.js']
const SOURCE = /\.(?:[cm]?[jt]sx?)$/
const SKIP = new Set(['node_modules', '.next', 'generated'])

function* walk(dir) {
  let entries
  try {
    entries = readdirSync(dir)
  } catch {
    return
  }
  for (const name of entries) {
    if (SKIP.has(name)) continue
    const path = join(dir, name)
    if (statSync(path).isDirectory()) yield* walk(path)
    else if (SOURCE.test(name)) yield path
  }
}

function main() {
  const paths = [...DIRS.flatMap((dir) => [...walk(join(ROOT, dir))]), ...FILES.map((file) => join(ROOT, file))]
  let changed = 0
  for (const path of paths) {
    const before = readFileSync(path, 'utf8')
    const after = rewrite(before)
    if (after === before) continue
    writeFileSync(path, after)
    console.log(relative(ROOT, path))
    changed++
  }
  console.log(`framer-to-motion: ${changed} file(s) changed.`)
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main()
