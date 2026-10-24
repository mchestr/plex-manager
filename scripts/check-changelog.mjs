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

import { checkChangelog } from './release/changelog.mjs'

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

function changelogAt(ref) {
  try {
    return git(['show', `${ref}:CHANGELOG.md`])
  } catch {
    return ''
  }
}

const files = git(['diff', '--name-only', values.base, values.head]).split('\n').filter(Boolean)
const labels = values.labels
  .split('\n')
  .map((label) => label.trim())
  .filter(Boolean)

const result = checkChangelog({
  files,
  labels,
  baseChangelog: changelogAt(values.base),
  headChangelog: changelogAt(values.head),
})

if (!result.ok) {
  console.error(`::error title=Changelog::${result.message}`)
  process.exit(1)
}
console.log(`check-changelog: ${result.message}`)
