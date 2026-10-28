/**
 * @jest-environment node
 */

/**
 * The release preparation (P11.25): on a temp copy, the version bump, the
 * Unreleased section moved under a dated heading with a new empty one above
 * it, and refusals that write nothing. Also checks the committed
 * CHANGELOG.md keeps the shape the release workflow needs.
 */

import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import os from "node:os"
import path from "node:path"

import {
  compareSemver,
  cutRelease,
  releasedVersions,
  releaseNotes,
  unreleasedBody,
  upgradeNoteProblems,
} from "../release/changelog.mjs"
import { prepareRelease } from "../release/prepare.mjs"

const ROOT = path.join(__dirname, "..", "..")

const CHANGELOG = `# Changelog

Intro.

## [Unreleased]

### Upgrade notes

- Take a \`pg_dump -Fc\` before you start the new release.
- Set \`NEW_VARIABLE\`.

### Added

- A thing.

## [0.3.0] - 2026-10-23

### Upgrade notes

- Take a \`pg_dump -Fc\` first.

[unreleased]: https://github.com/mchestr/plex-manager/compare/v0.3.0...HEAD
[0.3.0]: https://github.com/mchestr/plex-manager/releases/tag/v0.3.0
`

let dir: string

function write(changelog = CHANGELOG, version = "0.3.0") {
  writeFileSync(path.join(dir, "package.json"), `${JSON.stringify({ name: "plex-manager", version, private: true }, null, 2)}\n`)
  writeFileSync(
    path.join(dir, "package-lock.json"),
    `${JSON.stringify({ name: "plex-manager", version, lockfileVersion: 3, packages: { "": { name: "plex-manager", version } } }, null, 2)}\n`
  )
  writeFileSync(path.join(dir, "CHANGELOG.md"), changelog)
}

const read = (file: string) => readFileSync(path.join(dir, file), "utf8")

beforeEach(() => {
  dir = mkdtempSync(path.join(os.tmpdir(), "release-prepare-"))
})

afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
})

describe("prepareRelease", () => {
  it("bumps package.json and both lockfile versions", () => {
    write()
    prepareRelease(dir, "0.4.0", "2027-02-09")

    expect(JSON.parse(read("package.json")).version).toBe("0.4.0")
    const lock = JSON.parse(read("package-lock.json"))
    expect(lock.version).toBe("0.4.0")
    expect(lock.packages[""].version).toBe("0.4.0")
    expect(read("package.json").endsWith("}\n")).toBe(true)
  })

  it("moves Unreleased under the dated heading and leaves a new empty Unreleased", () => {
    write()
    const notes = prepareRelease(dir, "0.4.0", "2027-02-09")
    const changelog = read("CHANGELOG.md")

    expect(changelog).toContain("## [Unreleased]\n\n## [0.4.0] - 2027-02-09\n\n### Upgrade notes\n")
    expect(unreleasedBody(changelog)?.filter((line: string) => line.trim() !== "")).toEqual([])
    expect(releasedVersions(changelog)).toEqual(["0.4.0", "0.3.0"])
    expect(releaseNotes(changelog, "0.4.0")).toBe(notes)
    expect(notes).toContain("- Set `NEW_VARIABLE`.")
    expect(notes).toContain("- A thing.")
    expect(releaseNotes(changelog, "0.3.0")).toBe("### Upgrade notes\n\n- Take a `pg_dump -Fc` first.")
  })

  it("points the link definitions at the new tag", () => {
    write()
    prepareRelease(dir, "0.4.0", "2027-02-09")
    const changelog = read("CHANGELOG.md")

    expect(changelog).toContain("[unreleased]: https://github.com/mchestr/plex-manager/compare/v0.4.0...HEAD\n")
    expect(changelog).toContain("[0.4.0]: https://github.com/mchestr/plex-manager/releases/tag/v0.4.0\n")
    expect(changelog).toContain("[0.3.0]: https://github.com/mchestr/plex-manager/releases/tag/v0.3.0\n")
    expect(changelog.match(/^\[unreleased\]: /gim)).toHaveLength(1)
  })

  it.each([
    ["equal to the changelog's newest", "0.3.0", "0.3.0"],
    ["lower than the changelog's newest", "0.2.9", "0.2.0"],
    ["not greater than package.json's", "0.3.1", "0.3.1"],
    ["a prerelease of the current version", "0.3.0-rc.1", "0.3.0"],
  ])("refuses a version %s and writes nothing", (_name, version, packageVersion) => {
    write(CHANGELOG, packageVersion)
    const before = [read("package.json"), read("package-lock.json"), read("CHANGELOG.md")]

    expect(() => prepareRelease(dir, version, "2027-02-09")).toThrow(/not greater than/)
    expect([read("package.json"), read("package-lock.json"), read("CHANGELOG.md")]).toEqual(before)
  })

  it("refuses a version that is not semver", () => {
    write()
    expect(() => prepareRelease(dir, "v0.4.0", "2027-02-09")).toThrow(/Not a semantic version/)
  })

  it("refuses an empty Unreleased section", () => {
    write(CHANGELOG.replace(/## \[Unreleased\][\s\S]*?(?=## \[0\.3\.0\])/, "## [Unreleased]\n\n### Upgrade notes\n\n"))
    expect(() => prepareRelease(dir, "0.4.0", "2027-02-09")).toThrow(/empty/)
  })

  it("refuses an Unreleased section without upgrade notes that start with a pg_dump", () => {
    write(CHANGELOG.replace("- Take a `pg_dump -Fc` before you start the new release.\n", ""))
    expect(() => prepareRelease(dir, "0.4.0", "2027-02-09")).toThrow(/pg_dump/)

    write(CHANGELOG.replace("### Upgrade notes\n\n- Take a `pg_dump -Fc` before you start the new release.\n- Set `NEW_VARIABLE`.\n\n", ""))
    expect(() => prepareRelease(dir, "0.4.0", "2027-02-09")).toThrow(/no "### Upgrade notes" block/)
  })
})

describe("cutRelease", () => {
  it("adds link definitions to a changelog that has none", () => {
    const text = "# Changelog\n\n## [Unreleased]\n\n### Upgrade notes\n\n- Take a `pg_dump`.\n"
    const out = cutRelease(text, "1.0.0", "2027-03-01")
    expect(out.endsWith("[unreleased]: https://github.com/mchestr/plex-manager/compare/v1.0.0...HEAD\n[1.0.0]: https://github.com/mchestr/plex-manager/releases/tag/v1.0.0\n")).toBe(true)
  })
})

describe("compareSemver", () => {
  it("orders by number, and a prerelease before its release", () => {
    expect(compareSemver("0.10.0", "0.9.9")).toBeGreaterThan(0)
    expect(compareSemver("1.0.0-rc.1", "1.0.0")).toBeLessThan(0)
    expect(compareSemver("1.0.0-rc.10", "1.0.0-rc.2")).toBeGreaterThan(0)
    expect(compareSemver("0.4.0", "0.4.0")).toBe(0)
  })
})

describe("the committed CHANGELOG.md", () => {
  const changelog = readFileSync(path.join(ROOT, "CHANGELOG.md"), "utf8")
  const versions = releasedVersions(changelog)

  it("lists releases newest first, the newest equal to package.json's version", () => {
    const pkg = JSON.parse(readFileSync(path.join(ROOT, "package.json"), "utf8"))
    expect(pkg.name).toBe("plex-manager")
    expect([...versions].sort(compareSemver).reverse()).toEqual(versions)
    expect(versions[0]).toBe(pkg.version)
  })

  it.each(releasedVersions(readFileSync(path.join(ROOT, "CHANGELOG.md"), "utf8")))(
    "%s has an upgrade-notes block that starts with a pg_dump, and a link",
    (version) => {
      expect(upgradeNoteProblems((releaseNotes(changelog, version) ?? "").split("\n"))).toEqual([])
      expect(changelog).toContain(`[${version}]: https://github.com/mchestr/plex-manager/releases/tag/v${version}\n`)
    }
  )

  it("has an Unreleased section and a link for it", () => {
    expect(unreleasedBody(changelog)).not.toBeNull()
    expect(changelog).toContain(`[unreleased]: https://github.com/mchestr/plex-manager/compare/v${versions[0]}...HEAD\n`)
  })

  it("is explained in the README: pinning, the changelog and rolling back", () => {
    const readme = readFileSync(path.join(ROOT, "README.md"), "utf8")
    const start = readme.indexOf("\n## Upgrade\n")
    const section = readme.slice(start, readme.indexOf("\n## ", start + 1))
    expect(start).toBeGreaterThan(-1)
    expect(section).toContain("Use a release tag in production")
    expect(section).toMatch(/`latest` tag is the newest build of `main`/)
    expect(section).toContain("CHANGELOG.md")
    expect(section).toMatch(/restore the dump/)
  })
})
