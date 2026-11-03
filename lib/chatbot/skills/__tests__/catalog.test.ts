/**
 * @jest-environment node
 */

import { mockReset } from "jest-mock-extended"

import { buildSkillSource } from "@/__tests__/helpers/factories"
import { prismaMock } from "@/__tests__/helpers/prisma-mock"
import { MAX_DOCS, listDocsResult, readDocResult, resolveRef, type KnowledgeRepo } from "@/lib/chatbot/knowledge/github"
import type { SkillSource } from "@/lib/generated/prisma/client"

import { MAX_SKILL_READS, SKILL_PROMPT_BUDGET, loadSkillCatalog, type SkillCatalog } from "../catalog"
import { skillsSection } from "../prompt"

jest.mock("@/lib/prisma", () => require("@/__tests__/helpers/prisma-mock").prismaModule)
jest.mock("@/lib/chatbot/knowledge/github", () => ({
  ...jest.requireActual<object>("@/lib/chatbot/knowledge/github"),
  resolveRef: jest.fn(),
  listDocsResult: jest.fn(),
  readDocResult: jest.fn(),
}))

const SHA = "c".repeat(40)

const source = (name: string, over: Partial<SkillSource> = {}) => buildSkillSource({ id: `src-${name}`, name, ...over })
const activeSources = (...rows: SkillSource[]) => prismaMock.skillSource.findMany.mockResolvedValue(rows)

const skillFile = (name: string, description = `Does ${name}`, body = `# ${name}`) => `---\nname: ${name}\ndescription: ${description}\n---\n${body}`
/** A skill is named after its folder, with dashes for slashes, or after its source at the repo root. */
const nameFor = (repo: KnowledgeRepo, path: string) => path.split("/").slice(0, -1).join("-") || repo.name.toLowerCase()
/** `count` skill folders, `a01/SKILL.md` and on. */
const skillPaths = (prefix: string, count: number) => Array.from({ length: count }, (_, i) => `${prefix}${String(i + 1).padStart(2, "0")}/SKILL.md`)
const folderOf = (path: string) => path.split("/")[0]

interface Listing {
  paths: string[]
  truncated?: boolean
  /** File text by path; any other path reads as a SKILL.md named by {@link nameFor}. */
  files?: Record<string, string>
}

const answer = (listings: Record<string, Listing>, repo: KnowledgeRepo, path: string) => ({
  ok: true as const,
  text: listings[repo.name].files?.[path] ?? skillFile(nameFor(repo, path)),
})

/** GitHub as these sources, by name, see it: every ref at {@link SHA}, then their listings and files. */
function github(listings: Record<string, Listing>) {
  jest.mocked(resolveRef).mockResolvedValue({ ok: true, sha: SHA })
  jest.mocked(listDocsResult).mockImplementation(async (repo) => ({ ok: true, paths: listings[repo.name].paths, truncated: listings[repo.name].truncated ?? false }))
  jest.mocked(readDocResult).mockImplementation(async (repo, path) => answer(listings, repo, path))
}

const names = (catalog: SkillCatalog) => catalog.skills.map((skill) => skill.name)

beforeEach(() => {
  mockReset(prismaMock)
  jest.mocked(resolveRef).mockReset()
  jest.mocked(listDocsResult).mockReset()
  jest.mocked(readDocResult).mockReset()
})

describe("loadSkillCatalog", () => {
  it("lists skills at one commit", async () => {
    activeSources(source("Ops"))
    github({ Ops: { paths: ["triage/SKILL.md", "triage/notes.md", "other.md"] } })

    const catalog = await loadSkillCatalog()

    expect(catalog).toEqual({
      skills: [
        {
          name: "triage",
          description: "Does triage",
          source: { id: "src-Ops", name: "Ops", repo: "octo/skills", ref: SHA, path: "", token: null, updatedAt: expect.any(Date) },
          sha: SHA,
          path: "triage/SKILL.md",
          folder: "triage",
          files: ["notes.md"],
          filesTruncated: false,
          url: `https://github.com/octo/skills/blob/${SHA}/triage/SKILL.md`,
        },
      ],
      problems: [],
      sources: [{ id: "src-Ops", name: "Ops", sha: SHA, pinned: false }],
    })
    const reads = [...jest.mocked(listDocsResult).mock.calls, ...jest.mocked(readDocResult).mock.calls]
    expect(reads).toHaveLength(2)
    for (const [repo] of reads) expect(repo.ref).toBe(SHA)

    const pinned = "e".repeat(40)
    activeSources(source("Ops", { ref: pinned }))
    jest.mocked(resolveRef).mockResolvedValue({ ok: true, sha: pinned })
    expect((await loadSkillCatalog()).sources).toEqual([{ id: "src-Ops", name: "Ops", sha: pinned, pinned: true }])
  })

  it("queries active sources by name", async () => {
    activeSources(source("b"), source("A"))
    github({ A: { paths: ["x/SKILL.md"] }, b: { paths: ["x/SKILL.md"] } })

    const catalog = await loadSkillCatalog()

    expect(prismaMock.skillSource.findMany).toHaveBeenCalledWith({ where: { isActive: true }, orderBy: { name: "asc" } })
    expect(catalog.sources.map((row) => row.name)).toEqual(["A", "b"])
    expect(catalog.skills.map((skill) => skill.source.name)).toEqual(["A"])
    expect(catalog.problems).toEqual([{ source: "b", path: "x/SKILL.md", reason: "duplicate_name", detail: "A" }])
  })

  it("caps supporting files at 50", async () => {
    const docs = Array.from({ length: 60 }, (_, i) => `big/doc-${String(i).padStart(2, "0")}.md`)
    activeSources(source("Ops"))
    github({ Ops: { paths: ["big/SKILL.md", ...docs] } })

    const [skill] = (await loadSkillCatalog()).skills

    expect(skill.files).toEqual(docs.slice(0, 50).map((path) => path.slice("big/".length)))
    expect(skill.filesTruncated).toBe(true)
  })

  it("reports invalid frontmatter", async () => {
    activeSources(source("Ops"))
    github({ Ops: { paths: ["SKILL.md", "bad/SKILL.md", "bad/notes.md", "guide.md"], files: { "bad/SKILL.md": "# No frontmatter" } } })

    const catalog = await loadSkillCatalog()

    expect(names(catalog)).toEqual(["ops"])
    expect(catalog.skills[0]).toMatchObject({ folder: "", files: ["guide.md"] })
    expect(catalog.problems).toEqual([{ source: "Ops", path: "bad/SKILL.md", reason: "invalid_frontmatter", detail: expect.stringContaining("frontmatter") }])
  })

  it("warns about a long skill", async () => {
    const long = skillFile("long", "Long", "x".repeat(12_001))
    activeSources(source("Ops"), source("Zed"))
    github({
      Ops: { paths: ["fits/SKILL.md", "long/SKILL.md"], files: { "fits/SKILL.md": skillFile("fits", "Fits", "x".repeat(12_000)), "long/SKILL.md": long } },
      // Not listed, so it gets no warning about how it would be read
      Zed: { paths: ["long/SKILL.md"], files: { "long/SKILL.md": long } },
    })

    const catalog = await loadSkillCatalog()

    expect(names(catalog)).toEqual(["fits", "long"])
    expect(catalog.problems).toEqual([
      { source: "Ops", path: "long/SKILL.md", reason: "too_long" },
      { source: "Zed", path: "long/SKILL.md", reason: "duplicate_name", detail: "Ops" },
    ])
  })

  it("first source wins a duplicate name", async () => {
    activeSources(source("A"), source("B"))
    github({ A: { paths: ["deploy/SKILL.md"] }, B: { paths: ["deploy/SKILL.md", "other/SKILL.md"] } })

    const catalog = await loadSkillCatalog()

    expect(catalog.skills.map((skill) => [skill.name, skill.source.name])).toEqual([
      ["deploy", "A"],
      ["other", "B"],
    ])
    expect(catalog.problems).toEqual([{ source: "B", path: "deploy/SKILL.md", reason: "duplicate_name", detail: "A" }])
  })

  it("reports failed reads", async () => {
    activeSources(source("Docs"), source("Ops"))
    github({ Docs: { paths: ["d/SKILL.md"] }, Ops: { paths: ["a/SKILL.md", "b/SKILL.md", "c/SKILL.md"] } })

    // The ref cannot be resolved
    jest.mocked(resolveRef).mockImplementation(async (repo) => (repo.name === "Docs" ? { ok: false, reason: "rate_limited" } : { ok: true, sha: SHA }))
    let catalog = await loadSkillCatalog()
    expect(catalog.problems).toEqual([{ source: "Docs", path: null, reason: "rate_limited" }])
    expect(catalog.sources).toEqual([expect.objectContaining({ name: "Docs", sha: null }), expect.objectContaining({ name: "Ops", sha: SHA })])
    expect(names(catalog)).toEqual(["a", "b", "c"])

    // The ref resolves, the listing does not
    jest.mocked(resolveRef).mockResolvedValue({ ok: true, sha: SHA })
    const listed = jest.mocked(listDocsResult).getMockImplementation()!
    jest.mocked(listDocsResult).mockImplementation(async (repo) => (repo.name === "Docs" ? { ok: false, reason: "unreachable" } : listed(repo)))
    catalog = await loadSkillCatalog()
    expect(catalog.problems).toEqual([{ source: "Docs", path: null, reason: "unreachable" }])
    expect(catalog.sources[0]).toMatchObject({ name: "Docs", sha: SHA })

    // One SKILL.md is rate-limited and one read throws, which the reader never should; the others still load
    const read = jest.mocked(readDocResult).getMockImplementation()!
    jest.mocked(readDocResult).mockImplementation(async (repo, path) => {
      if (path === "a/SKILL.md") return { ok: false, reason: "rate_limited" }
      if (path === "b/SKILL.md") throw new Error("reader bug")
      return read(repo, path)
    })
    catalog = await loadSkillCatalog()
    expect(names(catalog)).toEqual(["c"])
    expect(catalog.problems).toEqual([
      { source: "Docs", path: null, reason: "unreachable" },
      { source: "Ops", path: "a/SKILL.md", reason: "rate_limited" },
      { source: "Ops", path: "b/SKILL.md", reason: "unreachable" },
    ])

    // A cut listing still lists what it holds
    activeSources(source("Ops"))
    const cut = ["a/SKILL.md", ...Array.from({ length: MAX_DOCS - 1 }, (_, i) => `a/doc-${i}.md`)]
    github({ Ops: { paths: cut, truncated: true } })
    catalog = await loadSkillCatalog()
    expect(names(catalog)).toEqual(["a"])
    expect(catalog.problems).toEqual([{ source: "Ops", path: null, reason: "listing_truncated" }])
  })

  it("reads at most 50 SKILL.md files per load", async () => {
    const listings = {
      A: { paths: skillPaths("a", 30) },
      // The root SKILL.md sorts first ("S" before "b"); b24 is never read, but its notes stay in its folder
      B: { paths: ["SKILL.md", ...skillPaths("b", 24), "b24/notes.md"] },
    }
    activeSources(source("A"), source("B"))
    github(listings)
    const releases: Array<() => void> = []
    let pending = 0
    let most = 0
    jest.mocked(readDocResult).mockImplementation((repo, path) => {
      pending += 1
      most = Math.max(most, pending)
      return new Promise((resolve) =>
        releases.push(() => {
          pending -= 1
          resolve(answer(listings, repo, path))
        })
      )
    })

    const load = loadSkillCatalog()
    let done = false
    void load.then(() => {
      done = true
    })
    while (!done) {
      await new Promise((resolve) => setImmediate(resolve))
      releases.splice(0).forEach((release) => release())
    }
    const catalog = await load

    expect(most).toBe(8)
    const read = jest.mocked(readDocResult).mock.calls.map(([repo, path]) => `${repo.name}:${path}`)
    expect(read).toHaveLength(MAX_SKILL_READS)
    expect(read).toEqual([...skillPaths("a", 30).map((path) => `A:${path}`), "B:SKILL.md", ...skillPaths("b", 19).map((path) => `B:${path}`)])
    expect(catalog.problems).toEqual(skillPaths("b", 24).slice(19).map((path) => ({ source: "B", path, reason: "not_read" })))
    expect(catalog.skills.find((skill) => skill.name === "b")).toMatchObject({ folder: "", files: [] })
  })

  it("holds at most 50 skills", async () => {
    activeSources(source("A"), source("B"))
    github({ A: { paths: skillPaths("a", 30) }, B: { paths: skillPaths("b", 30) } })

    const catalog = await loadSkillCatalog()

    expect(names(catalog)).toEqual([...skillPaths("a", 30), ...skillPaths("b", 20)].map(folderOf))
    expect(catalog.problems).toEqual(skillPaths("b", 30).slice(20).map((path) => ({ source: "B", path, reason: "not_read" })))
  })

  it("stops at the first skill over the prompt budget", async () => {
    const long = skillPaths("s", 25)
    const description = "d".repeat(280)
    const files: Record<string, string> = { "z/SKILL.md": skillFile("z", "Short") }
    for (const path of long) files[path] = skillFile(folderOf(path), description)
    activeSources(source("Ops"))
    github({ Ops: { paths: [...long, "z/SKILL.md"], files } })

    const catalog = await loadSkillCatalog()

    const kept = catalog.skills
    expect(skillsSection(kept)!.length).toBeLessThanOrEqual(SKILL_PROMPT_BUDGET)
    const next = { name: folderOf(long[kept.length]), description }
    expect(skillsSection([...kept, next])!.length).toBeGreaterThan(SKILL_PROMPT_BUDGET)
    expect(names(catalog)).toEqual(long.slice(0, kept.length).map(folderOf))
    expect(kept).toHaveLength(20)
    expect(catalog.problems).toEqual([...long.slice(kept.length), "z/SKILL.md"].map((path) => ({ source: "Ops", path, reason: "not_in_prompt" })))
  })
})
