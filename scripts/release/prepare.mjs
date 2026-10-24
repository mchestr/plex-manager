#!/usr/bin/env node
/**
 * Prepares a release (plan step P11.25): bumps package.json and
 * package-lock.json, moves CHANGELOG.md's Unreleased section under the new
 * version with today's date, then commits on a `release/v<version>` branch,
 * pushes it and opens the PR `chore(release): v<version>`.
 *
 *   node scripts/release/prepare.mjs 0.4.0 [--date 2027-02-09] [--no-pr]
 *
 * `--no-pr` only edits the files. After the PR merges, the owner pushes the
 * tag; docs/releasing.md has the whole procedure.
 */

import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'

import { compareSemver, cutRelease, releaseNotes } from './changelog.mjs'

/**
 * Edits the three files under `root` for `version`. Throws, before writing
 * anything, when the version is not greater than package.json's or than every
 * version the changelog lists, or when Unreleased cannot be released.
 */
export function prepareRelease(root, version, date) {
  const pkgPath = join(root, 'package.json')
  const lockPath = join(root, 'package-lock.json')
  const changelogPath = join(root, 'CHANGELOG.md')

  const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'))
  const changelog = cutRelease(readFileSync(changelogPath, 'utf8'), version, date)
  if (compareSemver(version, pkg.version) <= 0) {
    throw new Error(`${version} is not greater than package.json's ${pkg.version}`)
  }
  const lock = JSON.parse(readFileSync(lockPath, 'utf8'))

  pkg.version = version
  lock.version = version
  if (lock.packages?.['']) lock.packages[''].version = version

  writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`)
  writeFileSync(lockPath, `${JSON.stringify(lock, null, 2)}\n`)
  writeFileSync(changelogPath, changelog)
  return releaseNotes(changelog, version)
}

function run(command, args) {
  return execFileSync(command, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] }).trim()
}

function main() {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: { date: { type: 'string' }, 'no-pr': { type: 'boolean', default: false } },
  })
  const [version] = positionals
  if (!version) {
    console.error('Usage: node scripts/release/prepare.mjs <version> [--date YYYY-MM-DD] [--no-pr]')
    process.exit(2)
  }
  const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
  const date = values.date ?? new Date().toISOString().slice(0, 10)

  if (!values['no-pr'] && run('git', ['status', '--porcelain']) !== '') {
    console.error('prepare: the working tree has changes; commit or set them aside first.')
    process.exit(1)
  }

  let notes
  try {
    notes = prepareRelease(root, version, date)
  } catch (error) {
    console.error(`prepare: ${error instanceof Error ? error.message : String(error)}`)
    process.exit(1)
  }
  console.log(`prepare: package.json, package-lock.json and CHANGELOG.md are at ${version} (${date}).`)
  if (values['no-pr']) return

  const branch = `release/v${version}`
  const title = `chore(release): v${version}`
  run('git', ['switch', '-c', branch])
  run('git', ['commit', '-m', title, '--', 'package.json', 'package-lock.json', 'CHANGELOG.md'])
  run('git', ['push', '-u', 'origin', branch])
  const body = [
    `Release v${version}. After this merges, push the tag from the merge commit on main (docs/releasing.md):`,
    '',
    '```bash',
    'git switch main && git pull',
    `git tag -a v${version} -m "v${version}" && git push origin v${version}`,
    '```',
    '',
    '## Release notes',
    '',
    notes,
  ].join('\n')
  console.log(run('gh', ['pr', 'create', '--base', 'main', '--head', branch, '--title', title, '--body', body]))
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main()
