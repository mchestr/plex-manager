#!/usr/bin/env node
/**
 * The pull-request changelog check (plan step P11.25), run by
 * `.github/workflows/changelog.yml`. The rules are `checkChangelog` in
 * `scripts/release/changelog.mjs`.
 *
 *   node scripts/check-changelog.mjs [--labels "<one per line>"] [--base HEAD^1] [--head HEAD]
 *
 * The defaults fit a pull_request checkout of the merge commit with
 * `fetch-depth: 2`: its first parent is the base branch, so `HEAD^1..HEAD` is
 * exactly what the pull request changes. `--labels` is a newline-separated list.
 */

import { execFileSync } from 'node:child_process'
import { parseArgs } from 'node:util'

import { checkChangelog, isFragmentPath } from './release/changelog.mjs'

const { values } = parseArgs({
  options: {
    base: { type: 'string', default: 'HEAD^1' },
    head: { type: 'string', default: 'HEAD' },
    labels: { type: 'string', default: '' },
  },
})

function git(args) {
  return execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
}

function fileAt(ref, file) {
  try {
    return git(['show', `${ref}:${file}`])
  } catch {
    return ''
  }
}

function changed(filter) {
  return git(['diff', '--name-only', `--diff-filter=${filter}`, values.base, values.head]).split('\n').filter(Boolean)
}

const files = changed('ACDMRT')
const fragmentPaths = changed('AMR').filter(isFragmentPath)
const labels = values.labels
  .split('\n')
  .map((label) => label.trim())
  .filter(Boolean)

const result = checkChangelog({
  files,
  labels,
  fragments: fragmentPaths.map((name) => ({ name, text: fileAt(values.head, name) })),
  addedFragments: changed('A').filter(isFragmentPath),
  headChangelog: fileAt(values.head, 'CHANGELOG.md'),
})

if (!result.ok) {
  console.error(`::error title=Changelog::${result.message}`)
  process.exit(1)
}
console.log(`check-changelog: ${result.message}`)
