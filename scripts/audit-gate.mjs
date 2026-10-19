#!/usr/bin/env node
/**
 * CI's audit gate (plan step P1.5): runs `npm audit --omit=dev --audit-level=high
 * --json` and fails on any high or critical advisory in a production
 * dependency that `.github/audit-exceptions.json` does not list, and on any
 * expired exception. The rules live in `scripts/audit/gate.mjs`.
 *
 *   node scripts/audit-gate.mjs
 */

import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { evaluateAudit } from './audit/gate.mjs'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const EXCEPTIONS = join(ROOT, '.github', 'audit-exceptions.json')

// npm audit exits non-zero when it finds anything, so its status is not the verdict.
const audit = spawnSync('npm', ['audit', '--omit=dev', '--audit-level=high', '--json'], {
  cwd: ROOT,
  encoding: 'utf8',
  maxBuffer: 64 * 1024 * 1024,
})
let report
try {
  report = JSON.parse(audit.stdout)
} catch {
  console.error('audit-gate: npm audit did not print a JSON report.')
  console.error(audit.stderr)
  process.exit(1)
}
if (report.error) {
  console.error(`audit-gate: npm audit failed: ${report.error.summary ?? JSON.stringify(report.error)}`)
  process.exit(1)
}

const { exceptions } = JSON.parse(readFileSync(EXCEPTIONS, 'utf8'))
const { failures, excepted } = evaluateAudit(report, exceptions)

for (const advisory of excepted) {
  console.log(`Excepted: ${advisory.severity} ${advisory.id} in ${advisory.packages.join(', ')}`)
}
if (failures.length > 0) {
  for (const failure of failures) console.error(`::error::${failure}`)
  console.error(`\naudit-gate: ${failures.length} problem(s). Upgrade the package, or add a short-lived exception to .github/audit-exceptions.json.`)
  process.exit(1)
}
console.log('audit-gate: no high or critical advisory in production dependencies.')
