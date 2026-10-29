/**
 * @jest-environment node
 */

/**
 * The pull-request changelog check (P11.25): a PR that touches a migration,
 * lib/env.ts, the entrypoint, the Dockerfile or deploy/, or carries the
 * breaking label, must add a changelog.d/ fragment; no-changelog skips that.
 * Every fragment a PR adds or changes must be well formed, and CHANGELOG.md
 * never gets an Unreleased section back.
 */

import { checkChangelog, isFragmentPath, parseFragment } from "../release/changelog.mjs"

const CHANGELOG = `# Changelog

## [0.3.0] - 2026-10-23

### Upgrade notes

- Take a \`pg_dump -Fc\` first.
`

const MIGRATION = "prisma/migrations/20270118000005_p1125_example_change/migration.sql"
const FRAGMENT = { name: "changelog.d/example-table.md", text: "### Added\n\n- Adds the example table.\n" }

interface CheckOptions {
  labels?: string[]
  fragments?: { name: string; text: string }[]
  added?: string[]
  head?: string
}

function check(files: string[], { labels = [], fragments = [], added, head = CHANGELOG }: CheckOptions = {}) {
  return checkChangelog({
    files,
    labels,
    fragments,
    addedFragments: added ?? fragments.map((fragment) => fragment.name),
    headChangelog: head,
  })
}

describe("checkChangelog", () => {
  it("fails a migration PR without a fragment", () => {
    const result = check([MIGRATION, "prisma/schema.prisma"])
    expect(result.ok).toBe(false)
    expect(result.message).toContain(MIGRATION)
    expect(result.message).toContain("changelog.d/")
    expect(result.message).toContain("no-changelog")
  })

  it("passes a migration PR that adds a fragment", () => {
    expect(check([MIGRATION, FRAGMENT.name], { fragments: [FRAGMENT] })).toEqual({
      ok: true,
      message: expect.stringContaining(FRAGMENT.name),
    })
  })

  it("does not count a fragment the PR only changes", () => {
    expect(check([MIGRATION, FRAGMENT.name], { fragments: [FRAGMENT], added: [] }).ok).toBe(false)
  })

  it("skips with the no-changelog label", () => {
    const result = check([MIGRATION], { labels: ["no-changelog"] })
    expect(result).toEqual({ ok: true, message: expect.stringContaining("no-changelog") })
  })

  it.each(["lib/env.ts", "docker/entrypoint.sh", "Dockerfile", "deploy/docker-compose.yml"])("needs a fragment for %s", (file) => {
    expect(check([file]).ok).toBe(false)
    expect(check([file], { fragments: [FRAGMENT] }).ok).toBe(true)
  })

  it("needs a fragment for the breaking label even without a watched file", () => {
    expect(check(["app/page.tsx"], { labels: ["breaking"] })).toEqual({
      ok: false,
      message: expect.stringContaining("breaking label"),
    })
    expect(check(["app/page.tsx"], { labels: ["breaking"], fragments: [FRAGMENT] }).ok).toBe(true)
  })

  it("passes a PR that touches none of them", () => {
    expect(check(["app/page.tsx", "lib/env-helpers.ts", "docs/Dockerfile.md", "e2e/deploy/spec.ts"]).ok).toBe(true)
  })

  it("fails a malformed fragment, even with no-changelog or no watched file", () => {
    const bad = { name: "changelog.d/bad.md", text: "### Fixes\n\n- Typo in the heading.\n" }
    for (const labels of [[], ["no-changelog"]]) {
      const result = check(["app/page.tsx", bad.name], { labels, fragments: [bad] })
      expect(result.ok).toBe(false)
      expect(result.message).toContain("changelog.d/bad.md")
      expect(result.message).toContain('"### Fixes"')
    }
  })

  it("fails a PR that puts an Unreleased section back in CHANGELOG.md", () => {
    const head = CHANGELOG.replace("## [0.3.0]", "## [Unreleased]\n\n### Added\n\n- A thing.\n\n## [0.3.0]")
    const result = check(["CHANGELOG.md"], { head, labels: ["no-changelog"] })
    expect(result.ok).toBe(false)
    expect(result.message).toContain("changelog.d/")
  })
})

describe("parseFragment", () => {
  it("groups items under their subsections, blank edges trimmed", () => {
    const { groups, problems } = parseFragment("### Fixed\n\n- One.\n  More of one.\n- Two.\n\n### Upgrade notes\n\n- Set `X`.\n")
    expect(problems).toEqual([])
    expect(Object.fromEntries(groups)).toEqual({ Fixed: ["- One.", "  More of one.", "- Two."], "Upgrade notes": ["- Set `X`."] })
  })

  it.each([
    ["no heading", "- A thing.\n", "above its first"],
    ["an empty file", "", 'no "### " subsection'],
    ["an unknown heading", "### Improved\n\n- A thing.\n", '"### Improved"'],
    ["an empty subsection", "### Added\n\n### Fixed\n\n- A thing.\n", '"### Added" is empty'],
    ["a version heading", "## [0.4.0]\n\n### Added\n\n- A thing.\n", "not a \"### \" subsection heading"],
    ["its own pg_dump item", "### Upgrade notes\n\n- Take a `pg_dump -Fc` first.\n", "pg_dump"],
  ])("reports %s", (_name, text, problem) => {
    expect(parseFragment(text).problems).toEqual([expect.stringContaining(problem)])
  })
})

describe("isFragmentPath", () => {
  it("matches changelog.d/*.md except the README", () => {
    expect(isFragmentPath("changelog.d/markdown-tables.md")).toBe(true)
    expect(isFragmentPath("changelog.d/README.md")).toBe(false)
    expect(isFragmentPath("changelog.d/nested/a.md")).toBe(false)
    expect(isFragmentPath("changelog.d/notes.txt")).toBe(false)
    expect(isFragmentPath("docs/changelog.d/a.md")).toBe(false)
  })
})
