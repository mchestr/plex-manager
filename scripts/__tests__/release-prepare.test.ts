/**
 * @jest-environment node
 */

/**
 * The release preparation (P11.25): on a temp copy, the version bump, the
 * changelog.d/ fragments merged under a dated heading and deleted, and
 * refusals that write nothing. Also checks the committed CHANGELOG.md and
 * fragments keep the shape the release workflow needs.
 */

import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import os from "node:os"
import path from "node:path"

import {
  compareSemver,
  cutRelease,
  hasUnreleasedSection,
  isFragmentPath,
  parseFragment,
  PG_DUMP_NOTE,
  releasedVersions,
  releaseNotes,
  upgradeNoteProblems,
} from "../release/changelog.mjs"
import { prepareRelease } from "../release/prepare.mjs"

const ROOT = path.join(__dirname, "..", "..")

const CHANGELOG = `# Changelog

Intro.

## [0.3.0] - 2026-10-23

### Upgrade notes

- Take a \`pg_dump -Fc\` first.

[0.3.0]: https://github.com/mchestr/plex-manager/releases/tag/v0.3.0
`

const FRAGMENTS: Record<string, string> = {
  "b-variable.md": "### Fixed\n\n- A fix.\n\n### Upgrade notes\n\n- Set `NEW_VARIABLE`.\n",
  "a-thing.md": "### Added\n\n- A thing.\n",
  "README.md": "# Changelog fragments\n",
}

let dir: string

function write(changelog = CHANGELOG, version = "0.3.0", fragments = FRAGMENTS) {
  mkdirSync(path.join(dir, "changelog.d"), { recursive: true })
  for (const [name, text] of Object.entries(fragments)) writeFileSync(path.join(dir, "changelog.d", name), text)
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

  it("merges the fragments under the dated heading, pg_dump first, and deletes them", () => {
    write()
    const notes = prepareRelease(dir, "0.4.0", "2027-02-09")
    const changelog = read("CHANGELOG.md")

    expect(changelog).toContain("Intro.\n\n## [0.4.0] - 2027-02-09\n\n### Upgrade notes\n")
    expect(releasedVersions(changelog)).toEqual(["0.4.0", "0.3.0"])
    expect(releaseNotes(changelog, "0.4.0")).toBe(notes)
    expect(notes).toBe(
      ["### Upgrade notes", "", PG_DUMP_NOTE, "- Set `NEW_VARIABLE`.", "", "### Added", "", "- A thing.", "", "### Fixed", "", "- A fix."].join("\n")
    )
    expect(releaseNotes(changelog, "0.3.0")).toBe("### Upgrade notes\n\n- Take a `pg_dump -Fc` first.")
    expect(readdirSync(path.join(dir, "changelog.d"))).toEqual(["README.md"])
  })

  it("lists fragments in name order and joins their items in one list", () => {
    write(CHANGELOG, "0.3.0", { "b.md": "### Added\n\n- From b.\n", "a.md": "### Added\n\n- From a.\n" })
    expect(prepareRelease(dir, "0.4.0", "2027-02-09")).toContain("### Added\n\n- From a.\n- From b.")
  })

  it("points the link definitions at the new tag", () => {
    write()
    prepareRelease(dir, "0.4.0", "2027-02-09")
    const changelog = read("CHANGELOG.md")

    expect(changelog).toContain("[0.4.0]: https://github.com/mchestr/plex-manager/releases/tag/v0.4.0\n[0.3.0]")
    expect(changelog).toContain("[0.4.0]: https://github.com/mchestr/plex-manager/releases/tag/v0.4.0\n")
    expect(changelog).toContain("[0.3.0]: https://github.com/mchestr/plex-manager/releases/tag/v0.3.0\n")
    expect(changelog.match(/^\[0\.4\.0\]: /gm)).toHaveLength(1)
  })

  it.each([
    ["equal to the changelog's newest", "0.3.0", "0.3.0"],
    ["lower than the changelog's newest", "0.2.9", "0.2.0"],
    ["not greater than package.json's", "0.3.1", "0.3.1"],
    ["a prerelease of the current version", "0.3.0-rc.1", "0.3.0"],
  ])("refuses a version %s and writes nothing", (_name, version, packageVersion) => {
    write(CHANGELOG, packageVersion)
    const before = [read("package.json"), read("package-lock.json"), read("CHANGELOG.md"), read("changelog.d/a-thing.md")]

    expect(() => prepareRelease(dir, version, "2027-02-09")).toThrow(/not greater than/)
    expect([read("package.json"), read("package-lock.json"), read("CHANGELOG.md"), read("changelog.d/a-thing.md")]).toEqual(before)
  })

  it("refuses a version that is not semver", () => {
    write()
    expect(() => prepareRelease(dir, "v0.4.0", "2027-02-09")).toThrow(/Not a semantic version/)
  })

  it("refuses a release with no fragments", () => {
    write(CHANGELOG, "0.3.0", { "README.md": "# Changelog fragments\n" })
    expect(() => prepareRelease(dir, "0.4.0", "2027-02-09")).toThrow(/nothing to release/)

    rmSync(path.join(dir, "changelog.d"), { recursive: true })
    expect(() => prepareRelease(dir, "0.4.0", "2027-02-09")).toThrow(/nothing to release/)
  })

  it("refuses a malformed fragment and deletes nothing", () => {
    write(CHANGELOG, "0.3.0", { ...FRAGMENTS, "c-bad.md": "### Improved\n\n- A thing.\n" })
    expect(() => prepareRelease(dir, "0.4.0", "2027-02-09")).toThrow(/changelog\.d\/c-bad\.md: "### Improved"/)
    expect(existsSync(path.join(dir, "changelog.d", "a-thing.md"))).toBe(true)
    expect(read("CHANGELOG.md")).toBe(CHANGELOG)
  })

  it("refuses a changelog that still has an Unreleased section", () => {
    write(CHANGELOG.replace("## [0.3.0]", "## [Unreleased]\n\n## [0.3.0]"))
    expect(() => prepareRelease(dir, "0.4.0", "2027-02-09")).toThrow(/Unreleased/)
  })
})

describe("cutRelease", () => {
  it("adds link definitions to a changelog that has none", () => {
    const out = cutRelease("# Changelog\n", "1.0.0", "2027-03-01", [{ name: "changelog.d/a.md", text: "### Added\n\n- A.\n" }])
    expect(out).toContain("# Changelog\n\n## [1.0.0] - 2027-03-01\n\n### Upgrade notes\n")
    expect(out.endsWith("- A.\n\n[1.0.0]: https://github.com/mchestr/plex-manager/releases/tag/v1.0.0\n")).toBe(true)
    expect(upgradeNoteProblems((releaseNotes(out, "1.0.0") ?? "").split("\n"))).toEqual([])
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

  it("has no Unreleased section: pending entries are changelog.d/ fragments", () => {
    expect(hasUnreleasedSection(changelog)).toBe(false)
    expect(changelog).not.toMatch(/^\[unreleased\]: /im)
  })

  it.each(readdirSync(path.join(ROOT, "changelog.d")).map((name) => `changelog.d/${name}`).filter(isFragmentPath))(
    "%s is a well-formed fragment",
    (name) => {
      expect(parseFragment(readFileSync(path.join(ROOT, name), "utf8")).problems).toEqual([])
    }
  )

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
