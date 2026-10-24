/**
 * @jest-environment node
 */

/**
 * Guards the agent skills in `.claude/skills/` (P1.9): every vendored skill
 * is pinned and licensed, every project-authored one (P11.27) has its
 * THIRD_PARTY.md row, none can run shell commands or fetch at run time, and
 * the committed MCP config holds one pinned server.
 */

import fs from "fs"
import path from "path"

const ROOT = path.join(__dirname, "..", "..")
const SKILLS_DIR = path.join(ROOT, ".claude", "skills")
const THIRD_PARTY = path.join(SKILLS_DIR, "THIRD_PARTY.md")

const SHA = /^[0-9a-f]{40}$/
const NPM_VERSION = /^(@[a-z0-9-]+\/)?[a-z0-9.-]+@\d+\.\d+\.\d+$/
const LICENCE_FILE = /^LICEN[CS]E(\.(txt|md))?$/
/** The pin cell of a skill written in this repository. */
const PROJECT_AUTHORED = "project-authored"

function listFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name)
    return entry.isDirectory() ? listFiles(full) : [full]
  })
}

function skillFolders(): string[] {
  return fs
    .readdirSync(SKILLS_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort()
}

/** Rows of the provenance table: skill name -> pin cell (backticks stripped). */
function provenanceRows(): Map<string, string> {
  const rows = new Map<string, string>()
  for (const line of fs.readFileSync(THIRD_PARTY, "utf8").split("\n")) {
    const cells = line.split("|").map((cell) => cell.trim())
    // | `name` | upstream | `pin` | licence | reviewed | reviewer | changes |
    if (cells.length < 9 || !/^`[^`]+`$/.test(cells[1])) continue
    rows.set(cells[1].slice(1, -1), cells[3].replace(/`/g, ""))
  }
  return rows
}

function readJson(file: string): unknown {
  return JSON.parse(fs.readFileSync(path.join(ROOT, file), "utf8"))
}

const vendoredFiles = listFiles(SKILLS_DIR).filter((file) => file !== THIRD_PARTY)
const vendoredMarkdown = vendoredFiles.filter((file) => file.endsWith(".md"))

const projectSkills = () => skillFolders().filter((skill) => provenanceRows().get(skill) === PROJECT_AUTHORED)
const vendoredSkills = () => skillFolders().filter((skill) => provenanceRows().get(skill) !== PROJECT_AUTHORED)

describe("vendored agent skills", () => {
  it("vendors the seven reviewed skills", () => {
    expect(vendoredSkills()).toEqual([
      "accessibility-review",
      "frontend-design",
      "motion",
      "vercel-composition-patterns",
      "vercel-react-best-practices",
      "vercel-react-view-transitions",
      "web-design-guidelines",
    ])
  })

  it("holds the four project-authored skills", () => {
    expect(projectSkills()).toEqual(["rewind-design-system", "rewind-page", "share-card", "visual-qa"])
  })

  it.each(projectSkills())("%s is a single SKILL.md with no URLs or web fetches", (skill) => {
    expect(fs.readdirSync(path.join(SKILLS_DIR, skill))).toEqual(["SKILL.md"])
    const text = fs.readFileSync(path.join(SKILLS_DIR, skill, "SKILL.md"), "utf8")
    expect(text).not.toMatch(/https?:\/\/|WebFetch/)
  })

  it.each(vendoredSkills())("%s has a SKILL.md, a licence and a pinned THIRD_PARTY.md row", (skill) => {
    const files = fs.readdirSync(path.join(SKILLS_DIR, skill))
    expect(files).toContain("SKILL.md")
    expect(files.some((name) => LICENCE_FILE.test(name))).toBe(true)

    const pin = provenanceRows().get(skill)
    expect(pin).toBeDefined()
    expect(SHA.test(pin ?? "") || NPM_VERSION.test(pin ?? "")).toBe(true)
  })

  it("has no THIRD_PARTY.md row without a vendored folder", () => {
    for (const name of provenanceRows().keys()) {
      expect(fs.existsSync(path.join(SKILLS_DIR, name))).toBe(true)
    }
  })

  it("has no allowed-tools, shell injection lines or raw GitHub fetches in any vendored .md", () => {
    const offending = vendoredMarkdown.filter((file) => {
      const text = fs.readFileSync(file, "utf8")
      return /allowed-tools:/.test(text) || /^\s*!`/m.test(text) || text.includes("raw.githubusercontent.com")
    })
    expect(offending.map((file) => path.relative(ROOT, file))).toEqual([])
  })

  it("has no archives or executable files", () => {
    const offending = vendoredFiles.filter(
      (file) => /\.(zip|tar\.gz|tgz)$/.test(file) || (fs.statSync(file).mode & 0o111) !== 0,
    )
    expect(offending.map((file) => path.relative(ROOT, file))).toEqual([])
  })
})

describe("agent settings", () => {
  it("disables shell execution from skills and allows each vendored skill", () => {
    const settings = readJson(".claude/settings.json") as {
      disableSkillShellExecution?: unknown
      permissions?: { allow?: unknown }
    }
    expect(settings.disableSkillShellExecution).toBe(true)

    const allow = Array.isArray(settings.permissions?.allow) ? settings.permissions.allow : []
    for (const skill of skillFolders()) {
      expect(allow).toContain(`Skill(${skill})`)
    }
  })

  it("commits exactly one MCP server, pinned to an exact version", () => {
    const config = readJson(".mcp.json") as { mcpServers?: Record<string, { args?: unknown }> }
    const servers = Object.entries(config.mcpServers ?? {})
    expect(servers.map(([name]) => name)).toEqual(["chrome-devtools"])

    const args = servers[0][1].args
    expect(Array.isArray(args)).toBe(true)
    const packages = (args as unknown[]).filter(
      (arg): arg is string => typeof arg === "string" && !arg.startsWith("-"),
    )
    expect(packages).toHaveLength(1)
    expect(packages[0]).toMatch(NPM_VERSION)
  })
})
