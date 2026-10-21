#!/usr/bin/env node
/**
 * Design-system guardrail (ui-design-system 9.6, plan step P1.8). Counts the
 * banned patterns in `scripts/design-system/rules.mjs` per file under `app/`
 * and `components/`, and compares them with `design-debt.json`.
 *
 *   npm run design:report    totals per rule and the top 20 files (default)
 *   npm run design:check     fails on a rise or a new file with a non-zero count
 *   npm run design:update    lowers the baseline; refuses to raise a count
 *   npm run design:baseline  rewrites the baseline from the current tree
 *
 * `--check` and `--update` carry counts across renames found by
 * `git diff --find-renames --name-status <base>...HEAD` (`--base`, default
 * `origin/main`). `design:baseline` is for the owner after a merge that renames
 * or moves files on `main` itself, where no diff against `origin/main` shows
 * the rename; review the diff of `design-debt.json` before committing it.
 */

import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { RULES, compare, countFile, nonZero, sortKeys, totals, update } from './design-system/rules.mjs'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const BASELINE = join(ROOT, 'design-debt.json')
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

function renames(base) {
  try {
    return git(['diff', '--find-renames', '--name-status', `${base}...HEAD`])
      .split('\n')
      .filter((line) => line.startsWith('R'))
      .map((line) => line.split('\t').slice(1, 3))
  } catch {
    console.warn(`design-system: cannot diff against ${base}; renames are not carried over.`)
    return []
  }
}

function readBaseline() {
  if (!existsSync(BASELINE)) {
    console.error('design-system: design-debt.json is missing; run `npm run design:baseline`.')
    process.exit(1)
  }
  return JSON.parse(readFileSync(BASELINE, 'utf8')).files
}

function writeBaseline(files) {
  const json = {
    schema: 1,
    commit: git(['rev-parse', 'HEAD']).trim(),
    generatedAt: new Date().toISOString(),
    files,
    totals: totals(files),
  }
  writeFileSync(BASELINE, `${JSON.stringify(json, null, 2)}\n`)
  console.log(`design-system: wrote design-debt.json (${Object.keys(files).length} files).`)
}

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

function printFailures(result) {
  for (const { file, from, rule, was, now } of result.rises) {
    console.error(`  ${file}${from ? ` (renamed from ${from})` : ''}: ${rule} rose from ${was} to ${now}`)
  }
  for (const { file, counts } of result.added) {
    const list = Object.entries(counts).map(([rule, n]) => `${rule} ${n}`).join(', ')
    console.error(`  ${file}: new file must count zero (${list})`)
  }
}

const args = process.argv.slice(2)
const baseIndex = args.indexOf('--base')
const base = baseIndex >= 0 ? args[baseIndex + 1] : 'origin/main'
const mode = ['--check', '--update', '--baseline'].find((flag) => args.includes(flag)) ?? '--report'
const current = scan()

if (mode === '--report') report(current)
else if (mode === '--baseline') writeBaseline(nonZero(current))
else {
  const baseline = readBaseline()
  if (mode === '--check') {
    const result = compare(baseline, current, renames(base))
    if (!result.ok) {
      console.error('design-system: design debt rose (ui-design-system 9.6):')
      printFailures(result)
      process.exit(1)
    }
    const stale = result.drops.length > 0 || result.deleted.length > 0
    console.log(
      stale
        ? `design-system: counts fell in ${new Set(result.drops.map((d) => d.file)).size} file(s) and ${result.deleted.length} file(s) are gone; run \`npm run design:update\` and commit design-debt.json.`
        : 'design-system: no design debt added.'
    )
  } else {
    const { ok, result, files } = update(baseline, current, renames(base))
    if (!ok) {
      console.error('design-system: refusing to raise the baseline:')
      printFailures(result)
      process.exit(1)
    }
    writeBaseline(sortKeys(files))
  }
}
