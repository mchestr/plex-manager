#!/usr/bin/env node
/**
 * Prints one version's CHANGELOG.md section, for `gh release create
 * --notes-file` in `.github/workflows/release.yml` (plan step P11.25).
 *
 *   node scripts/release/notes.mjs 0.4.0 > notes.md
 *
 * Exits 1 when the version has no section or its section has no upgrade notes.
 */

import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { releaseNotes, upgradeNoteProblems } from './changelog.mjs'

const version = process.argv[2]
if (!version) {
  console.error('Usage: node scripts/release/notes.mjs <version>')
  process.exit(2)
}

const changelog = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'CHANGELOG.md'), 'utf8')
const notes = releaseNotes(changelog, version)
if (!notes) {
  console.error(`notes: CHANGELOG.md has no "## [${version}]" section. Run scripts/release/prepare.mjs first.`)
  process.exit(1)
}
const problems = upgradeNoteProblems(notes.split('\n'))
if (problems.length > 0) {
  console.error(`notes: the ${version} section is not releasable: ${problems.join('; ')}`)
  process.exit(1)
}
process.stdout.write(`${notes}\n`)
