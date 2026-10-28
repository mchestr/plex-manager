/**
 * @jest-environment node
 */

/**
 * The pull-request changelog check (P11.25): a PR that touches a migration,
 * lib/env.ts, the entrypoint, the Dockerfile or deploy/, or carries the
 * breaking label, must add a line under Unreleased; no-changelog skips it.
 */

import { checkChangelog } from "../release/changelog.mjs"

const BASE = `# Changelog

## [Unreleased]

### Upgrade notes

- Take a \`pg_dump -Fc\` before you start the new release.

## [0.3.0] - 2026-10-23

### Upgrade notes

- Take a \`pg_dump -Fc\` first.
`

const MIGRATION = "prisma/migrations/20270118000005_p1125_example_change/migration.sql"

function withEntry(line: string, base = BASE) {
  return base.replace("before you start the new release.\n", `before you start the new release.\n- ${line}\n`)
}

function check(files: string[], { labels = [] as string[], head = BASE, base = BASE } = {}) {
  return checkChangelog({ files, labels, baseChangelog: base, headChangelog: head })
}

describe("checkChangelog", () => {
  it("fails a migration PR without an entry", () => {
    const result = check([MIGRATION, "prisma/schema.prisma"])
    expect(result.ok).toBe(false)
    expect(result.message).toContain(MIGRATION)
    expect(result.message).toContain("no-changelog")
  })

  it("passes a migration PR that adds a line under Unreleased", () => {
    expect(check([MIGRATION, "CHANGELOG.md"], { head: withEntry("Adds the example table.") }).ok).toBe(true)
  })

  it("skips with the no-changelog label", () => {
    const result = check([MIGRATION], { labels: ["no-changelog"] })
    expect(result).toEqual({ ok: true, message: expect.stringContaining("no-changelog") })
  })

  it.each(["lib/env.ts", "docker/entrypoint.sh", "Dockerfile", "deploy/docker-compose.yml"])("needs an entry for %s", (file) => {
    expect(check([file]).ok).toBe(false)
    expect(check([file], { head: withEntry("Changed.") }).ok).toBe(true)
  })

  it("needs an entry for the breaking label even without a watched file", () => {
    expect(check(["app/page.tsx"], { labels: ["breaking"] })).toEqual({
      ok: false,
      message: expect.stringContaining("breaking label"),
    })
    expect(check(["app/page.tsx"], { labels: ["breaking"], head: withEntry("Breaks a thing.") }).ok).toBe(true)
  })

  it("passes a PR that touches none of them", () => {
    expect(check(["app/page.tsx", "lib/env-helpers.ts", "docs/Dockerfile.md", "e2e/deploy/spec.ts"]).ok).toBe(true)
  })

  it("does not count a line that only moves or that sits under a released version", () => {
    const base = withEntry("Already there.")
    expect(check([MIGRATION], { base, head: base }).ok).toBe(false)
    expect(check([MIGRATION], { head: `${BASE}- Under 0.3.0.\n` }).ok).toBe(false)
    expect(check([MIGRATION], { head: BASE.replace("## [Unreleased]\n", "## [Unreleased]\n\n### Added\n") }).ok).toBe(false)
  })

  it("counts a second copy of an existing line as added", () => {
    const base = withEntry("Same line.")
    expect(check([MIGRATION], { base, head: withEntry("Same line.", base) }).ok).toBe(true)
  })

  it("passes when the base has no changelog yet and the head adds one", () => {
    expect(check([MIGRATION, "CHANGELOG.md"], { base: "", head: BASE }).ok).toBe(true)
    expect(check([MIGRATION], { base: "", head: "" }).ok).toBe(false)
  })
})
