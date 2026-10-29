/**
 * CHANGELOG.md and changelog.d/ helpers for the release flow (plan step
 * P11.25, GAP-20), as pure functions so `scripts/__tests__/release-prepare.test.ts`
 * and `scripts/__tests__/check-changelog.test.ts` can drive them.
 *
 * A pull request never edits CHANGELOG.md, so two of them never conflict
 * there. Each adds its own fragment, `changelog.d/<topic>.md`, made of the
 * Keep a Changelog subsections it needs:
 *
 * ```
 * ### Fixed
 *
 * - **Markdown tables:** ...
 * ```
 *
 * `cutRelease()` merges every fragment into one dated section, adds the
 * `pg_dump` item that opens every release's upgrade notes, and
 * `scripts/release/prepare.mjs` deletes the fragments:
 *
 * ```
 * ## [0.4.0] - 2027-02-09         <- the fragments, subsections in SECTIONS order
 * ### Upgrade notes               <- first item: take a pg_dump
 * ### Added / Changed / Fixed / Security / Removed
 * ## [0.3.0] - 2026-10-23
 * ...
 * [0.4.0]: https://github.com/<repo>/releases/tag/v0.4.0
 * ```
 */

const SEMVER = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?$/
const HEADING = /^## \[([^\]]+)\]/
const LINK_DEF = /^\[([^\]]+)\]: /

const REPO_URL = 'https://github.com/mchestr/plex-manager'

/** The fragment directory, relative to the repository root. */
export const FRAGMENT_DIR = 'changelog.d'

/** The subsections a fragment may hold, in the order a release lists them. */
export const SECTIONS = ['Upgrade notes', 'Added', 'Changed', 'Deprecated', 'Removed', 'Fixed', 'Security']

/** The item that opens every release's upgrade notes. */
export const PG_DUMP_NOTE = '- Take a `pg_dump -Fc` before you start the new release.'

/** Files whose change needs a changelog fragment, as `checkChangelog` matches them. */
export const WATCHED_PATHS = [
  /^prisma\/migrations\//,
  /^lib\/env\.ts$/,
  /^docker\/entrypoint\.sh$/,
  /^Dockerfile$/,
  /^deploy\//,
]

/** A fragment's path: any `changelog.d/*.md` except its README. */
export function isFragmentPath(file) {
  return new RegExp(`^${FRAGMENT_DIR}/[^/]+\\.md$`).test(file) && file !== `${FRAGMENT_DIR}/README.md`
}

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

/** The released versions listed in the changelog, newest first as written. */
export function releasedVersions(text) {
  return sections(text)
    .map((section) => section.name)
    .filter((name) => name.toLowerCase() !== 'unreleased')
}

/** True when CHANGELOG.md has an `## [Unreleased]` section: entries belong in changelog.d/ now. */
export function hasUnreleasedSection(text) {
  return sections(text).some((section) => section.name.toLowerCase() === 'unreleased')
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
 * Splits a fragment into its subsections. `problems` is empty when the
 * fragment is well formed: only `### <one of SECTIONS>` headings, each with
 * content, nothing above the first, and no `pg_dump` item (the release adds
 * that one).
 *
 * @returns {{ groups: Map<string, string[]>, problems: string[] }}
 */
export function parseFragment(text) {
  const groups = new Map()
  const problems = []
  let current = null
  let unknown = false
  for (const line of text.split('\n')) {
    if (line.startsWith('### ')) {
      const name = line.slice(4).trim()
      unknown = !SECTIONS.includes(name)
      if (unknown) {
        problems.push(`"### ${name}" is not one of ${SECTIONS.map((section) => `"### ${section}"`).join(', ')}`)
        current = null
        continue
      }
      current = name
      if (!groups.has(name)) groups.set(name, [])
      continue
    }
    if (line.trim() === '') {
      if (current) groups.get(current).push(line)
      continue
    }
    if (line.startsWith('#')) {
      problems.push(`"${line}" is not a "### " subsection heading`)
      continue
    }
    if (unknown) continue
    if (!current) {
      problems.push('it has text above its first "### " heading')
      continue
    }
    groups.get(current).push(line)
  }
  for (const [name, lines] of groups) {
    const trimmed = trimBlank(lines)
    if (trimmed.length === 0) problems.push(`"### ${name}" is empty`)
    groups.set(name, trimmed)
  }
  if (groups.size === 0 && problems.length === 0) problems.push('it has no "### " subsection')
  if (groups.get('Upgrade notes')?.some((line) => line.includes('pg_dump'))) {
    problems.push('its upgrade notes repeat the `pg_dump` item, which every release adds on its own')
  }
  return { groups, problems: [...new Set(problems)] }
}

function trimBlank(lines) {
  let start = 0
  let end = lines.length
  while (start < end && lines[start].trim() === '') start++
  while (end > start && lines[end - 1].trim() === '') end--
  return lines.slice(start, end)
}

/**
 * One release body from fragments, `[{ name, text }]` in the order given:
 * each subsection once, in SECTIONS order, with the `pg_dump` item first.
 * Throws naming every malformed fragment.
 */
export function releaseBody(fragments) {
  const merged = new Map(SECTIONS.map((section) => [section, []]))
  const errors = []
  for (const fragment of fragments) {
    const { groups, problems } = parseFragment(fragment.text)
    if (problems.length > 0) {
      errors.push(`${fragment.name}: ${problems.join('; ')}`)
      continue
    }
    for (const [section, lines] of groups) merged.get(section).push(...lines)
  }
  if (errors.length > 0) throw new Error(`Malformed changelog fragments: ${errors.join(' | ')}`)

  merged.get('Upgrade notes').unshift(PG_DUMP_NOTE)
  const body = []
  for (const [section, lines] of merged) {
    if (lines.length === 0) continue
    body.push(`### ${section}`, '', ...lines, '')
  }
  return body
}

/**
 * Adds `## [version] - date` above the newest release, its body merged from
 * the fragments, and a link definition for its tag. Throws when the version
 * is not a semver greater than every released one, when there are no
 * fragments, or when a fragment is malformed.
 */
export function cutRelease(text, version, date, fragments) {
  if (!parseSemver(version)) throw new Error(`Not a semantic version: ${version} (write 0.4.0, without the v)`)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error(`Not a YYYY-MM-DD date: ${date}`)
  for (const released of releasedVersions(text).filter((name) => parseSemver(name))) {
    if (compareSemver(version, released) <= 0) {
      throw new Error(`${version} is not greater than ${released}, which the changelog already lists`)
    }
  }
  if (hasUnreleasedSection(text)) {
    throw new Error(`CHANGELOG.md has an "## [Unreleased]" section: move its entries into ${FRAGMENT_DIR}/ first`)
  }
  if (fragments.length === 0) throw new Error(`${FRAGMENT_DIR}/ has no fragments: nothing to release`)

  const section = [`## [${version}] - ${date}`, '', ...releaseBody(fragments)]
  const lines = text.split('\n')
  const first = sections(text)[0]?.start
  const linkStart = lines.findIndex((line) => LINK_DEF.test(line))
  const at = first ?? (linkStart === -1 ? lines.length : linkStart)
  const out = [...lines.slice(0, at), ...section, ...lines.slice(at)].filter((line) => !line.startsWith(`[${version}]: `))

  const link = `[${version}]: ${REPO_URL}/releases/tag/v${version}`
  const firstLink = out.findIndex((line) => LINK_DEF.test(line))
  if (firstLink === -1) {
    while (out.length > 0 && out[out.length - 1] === '') out.pop()
    return [...out, '', link, ''].join('\n')
  }
  return [...out.slice(0, firstLink), link, ...out.slice(firstLink)].join('\n')
}

/**
 * The pull-request changelog check. A PR that touches a watched path, or
 * carries the `breaking` label, must add a fragment; the `no-changelog` label
 * skips that. Whatever the labels, every fragment the PR adds or changes must
 * be well formed, and CHANGELOG.md must not grow an Unreleased section.
 *
 * @param {{ files: string[], labels: string[], fragments: { name: string, text: string }[], headChangelog: string, addedFragments: string[] }} input
 *   `fragments` are the fragments the PR adds or changes, read at its head;
 *   `addedFragments` the paths of the ones it adds.
 * @returns {{ ok: boolean, message: string }}
 */
export function checkChangelog({ files, labels, fragments, addedFragments, headChangelog }) {
  if (hasUnreleasedSection(headChangelog ?? '')) {
    return {
      ok: false,
      message:
        `CHANGELOG.md has an "## [Unreleased]" section. Put the entry in its own file under ${FRAGMENT_DIR}/ ` +
        `instead (${FRAGMENT_DIR}/README.md), so pull requests never conflict in CHANGELOG.md.`,
    }
  }
  const malformed = fragments
    .map((fragment) => ({ name: fragment.name, problems: parseFragment(fragment.text).problems }))
    .filter((fragment) => fragment.problems.length > 0)
  if (malformed.length > 0) {
    return {
      ok: false,
      message: `Malformed changelog fragment: ${malformed.map((fragment) => `${fragment.name}: ${fragment.problems.join('; ')}`).join(' | ')}`,
    }
  }

  if (labels.includes('no-changelog')) return { ok: true, message: 'Labelled no-changelog: skipped.' }

  const watched = files.filter((file) => WATCHED_PATHS.some((pattern) => pattern.test(file)))
  const breaking = labels.includes('breaking')
  if (watched.length === 0 && !breaking) {
    return { ok: true, message: 'No migration, environment, image or deploy change: no changelog fragment needed.' }
  }

  const reason = breaking ? 'it carries the breaking label' : `it changes ${watched.slice(0, 5).join(', ')}${watched.length > 5 ? ', ...' : ''}`
  if (addedFragments.length > 0) return { ok: true, message: `Changelog fragment added: ${addedFragments.join(', ')} (${reason}).` }
  return {
    ok: false,
    message:
      `This pull request needs a changelog fragment, ${FRAGMENT_DIR}/<topic>.md, because ${reason}. ` +
      'Put upgrade steps under "### Upgrade notes". If no operator needs to know, add the no-changelog label.',
  }
}
