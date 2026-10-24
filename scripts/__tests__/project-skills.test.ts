/**
 * @jest-environment node
 */

/**
 * Keeps the project-authored agent skills (P11.27) true to the code they
 * describe. For each skill in `.claude/skills/` that THIRD_PARTY.md marks
 * "project-authored":
 *
 * - its frontmatter parses, `name` is the folder name, and `description` and
 *   `paths` are present, with every `paths` glob rooted in a real folder;
 * - every backticked repository path exists (globs and `<page>` placeholders
 *   are checked up to their first wildcard);
 * - every backticked identifier is exported from a module under `lib/`,
 *   `components/` or `app/` (or `eslint/` and `scripts/`, for the guardrails);
 *   `Name.member` also needs `member` in that module;
 * - every `npm run` script exists in `package.json`, and every Playwright
 *   project it names exists in `playwright.config.ts`;
 * - it has no URLs.
 *
 * What counts as an identifier: a compound name such as `inkProps`,
 * `RewindPoster` or `CARD_VERSION`, optionally called (`inkProps(ink)`).
 * Single words (`select`, `paper`) and qualified names on a single word
 * (`share.facts`, `Config.rewindDisabledPages`) are prose, not checked.
 */

import fs from "fs"
import path from "path"

import { parse } from "yaml"

const ROOT = path.join(__dirname, "..", "..")
const SKILLS_DIR = path.join(ROOT, ".claude", "skills")
const THIRD_PARTY = path.join(SKILLS_DIR, "THIRD_PARTY.md")

const PROJECT_SKILLS = ["rewind-design-system", "rewind-page", "share-card", "visual-qa"]

/** Skill folders whose THIRD_PARTY.md row is pinned at "project-authored". */
function projectAuthoredRows(): string[] {
  return fs
    .readFileSync(THIRD_PARTY, "utf8")
    .split("\n")
    .map((line) => line.split("|").map((cell) => cell.trim()))
    .filter((cells) => cells.length >= 9 && /^`[^`]+`$/.test(cells[1]) && cells[3] === "project-authored")
    .map((cells) => cells[1].slice(1, -1))
    .sort()
}

function readSkill(name: string): { frontmatter: Record<string, unknown>; body: string } {
  const text = fs.readFileSync(path.join(SKILLS_DIR, name, "SKILL.md"), "utf8")
  const match = /^---\n([\s\S]*?)\n---\n([\s\S]*)$/.exec(text)
  if (!match) throw new Error(`${name}/SKILL.md has no frontmatter`)
  return { frontmatter: parse(match[1]) as Record<string, unknown>, body: match[2] }
}

const backticked = (text: string) => [...text.matchAll(/`([^`\n]+)`/g)].map((m) => m[1])

const TOP_LEVEL = new Set(fs.readdirSync(ROOT).filter((entry) => entry !== "node_modules"))

/** The part of a path or glob that must exist: up to the folder of its first wildcard or placeholder. */
function staticPart(token: string): string {
  const cut = token.search(/[*{<#]/)
  if (cut === -1) return token
  const head = token.slice(0, cut)
  return head.endsWith("/") ? head : head.slice(0, head.lastIndexOf("/") + 1)
}

const isRepoPath = (token: string) => !/\s/.test(token) && token.includes("/") && TOP_LEVEL.has(token.split("/")[0])

const IDENT = /^[A-Za-z_$][\w$]*$/
/** A compound name: camelCase, PascalCase with two words, or CONSTANT_CASE with an underscore. */
const isCompound = (name: string) => /[a-z0-9][A-Z]/.test(name) || /^[A-Z][A-Z0-9]*_[A-Z0-9_]+$/.test(name)

/** `{ head, member }` for a checked identifier token, else null. */
function identifierOf(token: string): { head: string; member?: string } | null {
  const name = token.replace(/\(.*\)$/, "")
  const [head, member, ...rest] = name.split(".")
  if (rest.length > 0 || !IDENT.test(head) || !isCompound(head)) return null
  if (member !== undefined && !IDENT.test(member)) return null
  return { head, member }
}

function sourceFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) return entry.name === "generated" ? [] : sourceFiles(full)
    return /\.(ts|tsx|mjs)$/.test(entry.name) && !entry.name.endsWith(".d.ts") ? [full] : []
  })
}

/** Exported name -> the files that export it, over the app's source folders and the guardrail scripts. */
function exportIndex(): Map<string, string[]> {
  const index = new Map<string, string[]>()
  const add = (name: string, file: string) => index.set(name, [...(index.get(name) ?? []), file])
  for (const file of ["lib", "components", "app", "eslint", "scripts"].flatMap((dir) => sourceFiles(path.join(ROOT, dir)))) {
    const text = fs.readFileSync(file, "utf8")
    for (const m of text.matchAll(/^export\s+(?:declare\s+)?(?:default\s+)?(?:async\s+)?(?:const|let|function\*?|class|interface|type|enum)\s+([A-Za-z_$][\w$]*)/gm)) add(m[1], file)
    for (const m of text.matchAll(/^export\s+(?:type\s+)?\{([^}]*)\}/gm)) {
      for (const part of m[1].split(",")) {
        const name = part.trim().replace(/^type\s+/, "").split(/\s+as\s+/).pop()
        if (name) add(name, file)
      }
    }
  }
  return index
}

const EXPORTS = exportIndex()
const SCRIPTS = Object.keys((JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8")) as { scripts: Record<string, string> }).scripts)
const PROJECTS = new Set(
  [...fs.readFileSync(path.join(ROOT, "playwright.config.ts"), "utf8").matchAll(/name:\s*'([\w-]+)'/g)].map((m) => m[1]),
)
/** Backticked words shaped like a Playwright project name. */
const PROJECT_NAME = /^(?:chromium|setup-wizard|(?:visual|a11y|light-theme|rewind-(?:visual|a11y|e2e|perf))(?:-[a-z0-9]+)*)$/

/** Whether a `paths` glob matches a file, for `**` and `*`. */
function globMatches(glob: string, file: string): boolean {
  const source = glob
    .split("**")
    .map((part) => part.split("*").map((s) => s.replace(/[.+?^${}()|[\]\\]/g, "\\$&")).join("[^/]*"))
    .join(".*")
  return new RegExp(`^${source}$`).test(file)
}

describe("project-authored agent skills", () => {
  it("are the four P11.27 skills, each marked project-authored in THIRD_PARTY.md", () => {
    expect(projectAuthoredRows()).toEqual([...PROJECT_SKILLS].sort())
  })

  describe.each(PROJECT_SKILLS)("%s", (name) => {
    const { frontmatter, body } = readSkill(name)
    const tokens = backticked(body)

    it("has frontmatter with its folder's name, a description and paths", () => {
      expect(frontmatter.name).toBe(name)
      expect(typeof frontmatter.description).toBe("string")
      expect((frontmatter.description as string).length).toBeGreaterThan(40)
      expect(Array.isArray(frontmatter.paths)).toBe(true)
      expect((frontmatter.paths as unknown[]).length).toBeGreaterThan(0)
    })

    it("scopes its paths to folders that exist", () => {
      const missing = (frontmatter.paths as string[]).filter((glob) => !fs.existsSync(path.join(ROOT, staticPart(glob))))
      expect(missing).toEqual([])
    })

    it("has no allowed-tools, shell lines or URLs", () => {
      const text = fs.readFileSync(path.join(SKILLS_DIR, name, "SKILL.md"), "utf8")
      expect(text).not.toMatch(/allowed-tools:/)
      expect(text).not.toMatch(/^\s*!`/m)
      expect(text).not.toMatch(/https?:\/\//)
    })

    it("names only repository paths that exist", () => {
      const missing = tokens.filter(isRepoPath).filter((token) => !fs.existsSync(path.join(ROOT, staticPart(token))))
      expect(missing).toEqual([])
    })

    it("names only identifiers that the code exports", () => {
      const missing = tokens.filter((token) => {
        const id = identifierOf(token)
        if (!id) return false
        const files = EXPORTS.get(id.head) ?? []
        if (files.length === 0) return true
        return id.member !== undefined && !files.some((file) => new RegExp(`\\b${id.member}\\b`).test(fs.readFileSync(file, "utf8")))
      })
      expect(missing).toEqual([])
    })

    it("names only npm scripts and Playwright projects that exist", () => {
      const scripts = [...body.matchAll(/npm run ([\w:-]+)/g)].map((m) => m[1])
      expect(scripts.filter((script) => !SCRIPTS.includes(script))).toEqual([])

      const projects = [
        ...[...body.matchAll(/--project[= ]([\w-]+)/g)].map((m) => m[1]),
        ...tokens.filter((token) => PROJECT_NAME.test(token) && !PROJECT_SKILLS.includes(token)),
      ]
      expect(projects.filter((project) => !PROJECTS.has(project))).toEqual([])
    })
  })

  it("load for a card file: share-card and rewind-design-system scope lib/rewind/cards/centrefold.tsx", () => {
    const loaded = PROJECT_SKILLS.filter((name) =>
      (readSkill(name).frontmatter.paths as string[]).some((glob) => globMatches(glob, "lib/rewind/cards/centrefold.tsx")),
    )
    expect(loaded).toEqual(["rewind-design-system", "share-card"])
  })
})
