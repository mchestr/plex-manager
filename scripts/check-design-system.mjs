#!/usr/bin/env node
/**
 * Design-system guardrail (ui-design-system 9.6, plan steps P1.8 and P10.11).
 * Counts the banned patterns in `scripts/design-system/rules.mjs` per file
 * under `app/` and `components/`.
 *
 *   npm run design:report    totals per rule and the top 20 files (default)
 *   npm run design:check     `--strict`: fails on any count outside the
 *                            documented allowlist (`design-system/allowlist.mjs`),
 *                            and on an allowlist entry that no longer covers one
 *
 * P10.11 replaced the per-file ratchet (`design-debt.json`) with the strict
 * check: a count that can't reach zero gets an allowlist entry with its
 * reason, reviewed in the PR.
 */

import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { staleEntries, strictFailures } from './design-system/allowlist.mjs'
import { RULES, countFile, totals } from './design-system/rules.mjs'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const EXTENSIONS = /\.(?:ts|tsx|css)$/
const EXCLUDED = [/^components\/ui\//, /(?:^|\/)__tests__\//, /\.test\.tsx?$/]

function git(args) {
  return execFileSync('git', args, { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
}

function scannedFiles() {
  return git(['ls-files', '-co', '--exclude-standard', '--', 'app', 'components'])
    .split('\n')
    .filter((file) => EXTENSIONS.test(file) && !EXCLUDED.some((re) => re.test(file)))
    .filter((file) => existsSync(join(ROOT, file)))
}

const read = (file) => readFileSync(join(ROOT, file), 'utf8')

function scan() {
  return Object.fromEntries(scannedFiles().map((file) => [file, countFile(file, read(file))]))
}

const nonZero = (current) => Object.fromEntries(Object.entries(current).filter(([, counts]) => Object.keys(counts).length > 0))

function report(current) {
  const files = nonZero(current)
  console.log('Design debt by rule:')
  for (const [rule, n] of Object.entries(totals(files))) console.log(`  ${rule.padEnd(18)} ${n}`)
  const sum = (counts) => Object.values(counts).reduce((a, b) => a + b, 0)
  const top = Object.entries(files)
    .sort(([a, x], [b, y]) => sum(y) - sum(x) || (a < b ? -1 : 1))
    .slice(0, 20)
  const palette = RULES.find((rule) => rule.id === 'raw-palette').pattern
  const utilities = {}
  for (const file of Object.keys(current)) {
    for (const match of read(file).match(palette) ?? []) utilities[match] = (utilities[match] ?? 0) + 1
  }
  console.log('\nTop 10 raw-palette utilities:')
  for (const [utility, n] of Object.entries(utilities).sort(([, a], [, b]) => b - a).slice(0, 10)) {
    console.log(`  ${utility.padEnd(18)} ${n}`)
  }
  console.log('\nTop 20 files:')
  for (const [file, counts] of top) console.log(`  ${String(sum(counts)).padStart(4)}  ${file}`)
}

function strict(current) {
  const failures = strictFailures(current)
  const stale = staleEntries(current)
  if (failures.length === 0 && stale.length === 0) {
    console.log('design-system: no banned patterns outside the allowlist.')
    return 0
  }
  if (failures.length > 0) {
    console.error('design-system: banned patterns outside the allowlist (ui-design-system 9.6):')
    for (const { file, rule, count } of failures) console.error(`  ${file}: ${rule} ${count}`)
    console.error('Fix them, or add an entry with its reason to scripts/design-system/allowlist.mjs.')
  }
  if (stale.length > 0) {
    console.error('design-system: allowlist entries that cover nothing now; delete them:')
    for (const entry of stale) console.error(`  ${entry.path}${entry.rules ? ` (${entry.rules.join(', ')})` : ''}`)
  }
  return 1
}

const args = process.argv.slice(2)
const current = scan()
if (args.includes('--strict')) process.exit(strict(current))
report(current)

