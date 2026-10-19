#!/usr/bin/env node
/**
 * Coverage ratchet (plan step P1.5). Reads `coverage/coverage-summary.json`
 * from a `jest --coverage` run and compares it with the floors in
 * `jest.coverage-thresholds.json` (Jest enforces the same floors itself).
 *
 *   node scripts/coverage-ratchet.mjs           fails when a value is below its floor
 *   node scripts/coverage-ratchet.mjs --update  raises floors to today's values; never lowers one
 *
 * Run the full suite first: `npm run test:coverage`.
 */

import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { check, measure, raise, relativeSummary } from './coverage/ratchet.mjs'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const THRESHOLDS = join(ROOT, 'jest.coverage-thresholds.json')
const SUMMARY = join(ROOT, 'coverage', 'coverage-summary.json')

if (!existsSync(SUMMARY)) {
  console.error('coverage-ratchet: no coverage/coverage-summary.json; run `npm run test:coverage` first.')
  process.exit(1)
}

const thresholds = JSON.parse(readFileSync(THRESHOLDS, 'utf8'))
const measured = measure(thresholds, relativeSummary(JSON.parse(readFileSync(SUMMARY, 'utf8')), ROOT))
const failures = check(thresholds, measured)

if (process.argv.includes('--update')) {
  writeFileSync(THRESHOLDS, `${JSON.stringify(raise(thresholds, measured), null, 2)}\n`)
  console.log('coverage-ratchet: floors raised where coverage rose; review jest.coverage-thresholds.json.')
}
if (failures.length > 0) {
  for (const failure of failures) console.error(`::error::${failure}`)
  process.exit(1)
}
console.log('coverage-ratchet: every value is at or above its floor.')
