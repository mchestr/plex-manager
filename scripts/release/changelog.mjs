/**
 * CHANGELOG.md helpers for the release flow (plan step P11.25, GAP-20), as
 * pure functions so `scripts/__tests__/release-prepare.test.ts` and
 * `scripts/__tests__/check-changelog.test.ts` can drive them.
 *
 * The changelog follows Keep a Changelog 1.1.0:
 *
 * ```
 * ## [Unreleased]                 <- every PR adds its lines here
 * ### Upgrade notes               <- mandatory in a release; first item: take a pg_dump
 * ### Added / Changed / Fixed / Security / Removed
 * ## [0.4.0] - 2027-02-09         <- cutRelease() moves Unreleased here
 * ...
 * [unreleased]: https://github.com/<repo>/compare/v0.4.0...HEAD
 * [0.4.0]: https://github.com/<repo>/releases/tag/v0.4.0
 * ```
 */

const SEMVER = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?$/
const HEADING = /^## \[([^\]]+)\]/
const LINK_DEF = /^\[([^\]]+)\]: /

const REPO_URL = 'https://github.com/mchestr/plex-manager'

/** Files whose change needs a changelog line, as `checkChangelog` matches them. */
export const WATCHED_PATHS = [
  /^prisma\/migrations\//,
  /^lib\/env\.ts$/,
  /^docker-entrypoint\.sh$/,
  /^Dockerfile$/,
  /^deploy\//,
]

/** Parses `1.2.3` or `1.2.3-rc.1`; null for anything else (no leading `v`). */
export function parseSemver(version) {
  const match = SEMVER.exec(version)
  if (!match) return null
  return { major: Number(match[1]), minor: Number(match[2]), patch: Number(match[3]), pre: match[4] ?? null }
}

/** Negative, zero or positive, like a sort comparator. A prerelease sorts before its release. */
export function compareSemver(a, b) {
  const x = parseSemver(a)
  const y = parseSemver(b)
  if (!x || !y) throw new Error(`Not a semantic version: ${!x ? a : b}`)
  for (const key of ['major', 'minor', 'patch']) {
    if (x[key] !== y[key]) return x[key] - y[key]
  }
  if (x.pre === y.pre) return 0
  if (x.pre === null) return 1
  if (y.pre === null) return -1
  return x.pre.localeCompare(y.pre, 'en', { numeric: true })
}

/** The `## [...]` sections in order, each with its heading line index and body lines. */
function sections(text) {
  const lines = text.split('\n')
  const found = []
  lines.forEach((line, index) => {
    const match = HEADING.exec(line)
    if (match) found.push({ name: match[1], start: index })
  })
  const linkStart = lines.findIndex((line) => LINK_DEF.test(line))
  return found.map((section, i) => {
    const next = found[i + 1]?.start ?? (linkStart === -1 ? lines.length : linkStart)
    return { ...section, end: next, body: lines.slice(section.start + 1, next) }
  })
}

/** Body lines that carry content: not blank, not a `###` heading. */
function contentLines(body) {
  return body.filter((line) => line.trim() !== '' && !line.startsWith('### '))
}

/** The released versions listed in the changelog, newest first as written. */
export function releasedVersions(text) {
  return sections(text)
    .map((section) => section.name)
    .filter((name) => name.toLowerCase() !== 'unreleased')
}

/** The Unreleased section's body lines, or null when the changelog has none. */
export function unreleasedBody(text) {
  return sections(text).find((section) => section.name.toLowerCase() === 'unreleased')?.body ?? null
}

/**
 * The body of one version's section, trimmed, for `gh release create
 * --notes-file`. Null when the version has no section.
 */
export function releaseNotes(text, version) {
  const section = sections(text).find((entry) => entry.name === version)
  if (!section) return null
  return section.body.join('\n').trim()
}

/**
 * Problems with a release body: it must hold an `### Upgrade notes` block
 * whose first item says to take a `pg_dump`. Empty when it is fine.
 */
export function upgradeNoteProblems(body) {
  const start = body.findIndex((line) => line.trim() === '### Upgrade notes')
  if (start === -1) return ['it has no "### Upgrade notes" block']
  const first = body.slice(start + 1).find((line) => line.trim() !== '')
  if (!first || first.startsWith('### ') || !first.includes('pg_dump')) {
    return ['its "### Upgrade notes" block must start with an item that says to take a `pg_dump`']
  }
  return []
}

/**
 * Moves the Unreleased section under `## [version] - date`, leaves a new empty
 * Unreleased above it, and points the link definitions at the new tag.
 * Throws when the version is not a semver greater than every released one,
 * when Unreleased is empty, or when its upgrade notes are missing.
 */
export function cutRelease(text, version, date) {
  if (!parseSemver(version)) throw new Error(`Not a semantic version: ${version} (write 0.4.0, without the v)`)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error(`Not a YYYY-MM-DD date: ${date}`)
  const newest = releasedVersions(text).filter((name) => parseSemver(name))
  for (const released of newest) {
    if (compareSemver(version, released) <= 0) {
      throw new Error(`${version} is not greater than ${released}, which the changelog already lists`)
    }
  }

  const all = sections(text)
  const unreleased = all.find((section) => section.name.toLowerCase() === 'unreleased')
  if (!unreleased) throw new Error('CHANGELOG.md has no "## [Unreleased]" section')
  if (contentLines(unreleased.body).length === 0) throw new Error('The Unreleased section is empty: nothing to release')
  const problems = upgradeNoteProblems(unreleased.body)
  if (problems.length > 0) throw new Error(`The Unreleased section cannot be released: ${problems.join('; ')}`)

  const lines = text.split('\n')
  const body = unreleased.body.join('\n').trim().split('\n')
  const released = [
    '## [Unreleased]',
    '',
    `## [${version}] - ${date}`,
    '',
    ...body,
    '',
  ]
  const out = [...lines.slice(0, unreleased.start), ...released, ...lines.slice(unreleased.end)]

  const withoutLinks = out.filter(
    (line) => !/^\[unreleased\]: /i.test(line) && !line.startsWith(`[${version}]: `)
  )
  const firstLink = withoutLinks.findIndex((line) => LINK_DEF.test(line))
  const links = [`[unreleased]: ${REPO_URL}/compare/v${version}...HEAD`, `[${version}]: ${REPO_URL}/releases/tag/v${version}`]
  if (firstLink === -1) {
    while (withoutLinks.length > 0 && withoutLinks[withoutLinks.length - 1] === '') withoutLinks.pop()
    return [...withoutLinks, '', ...links, ''].join('\n')
  }
  return [...withoutLinks.slice(0, firstLink), ...links, ...withoutLinks.slice(firstLink)].join('\n')
}

/**
 * The pull-request changelog check. A PR that touches a watched path, or
 * carries the `breaking` label, must add a line under Unreleased; the
 * `no-changelog` label skips the check.
 *
 * @returns {{ ok: boolean, message: string }}
 */
export function checkChangelog({ files, labels, baseChangelog, headChangelog }) {
  if (labels.includes('no-changelog')) return { ok: true, message: 'Labelled no-changelog: skipped.' }

  const watched = files.filter((file) => WATCHED_PATHS.some((pattern) => pattern.test(file)))
  const breaking = labels.includes('breaking')
  if (watched.length === 0 && !breaking) {
    return { ok: true, message: 'No migration, environment, image or deploy change: no changelog line needed.' }
  }

  const before = contentLines(unreleasedBody(baseChangelog ?? '') ?? [])
  const after = contentLines(unreleasedBody(headChangelog ?? '') ?? [])
  const remaining = new Map()
  for (const line of before) remaining.set(line, (remaining.get(line) ?? 0) + 1)
  const added = after.filter((line) => {
    const count = remaining.get(line) ?? 0
    if (count === 0) return true
    remaining.set(line, count - 1)
    return false
  })

  const reason = breaking ? 'it carries the breaking label' : `it changes ${watched.slice(0, 5).join(', ')}${watched.length > 5 ? ', ...' : ''}`
  if (added.length > 0) return { ok: true, message: `Changelog line added under Unreleased (${reason}).` }
  return {
    ok: false,
    message:
      `This pull request needs a line under "## [Unreleased]" in CHANGELOG.md, because ${reason}. ` +
      'Put upgrade steps under "### Upgrade notes". If no operator needs to know, add the no-changelog label.',
  }
}
