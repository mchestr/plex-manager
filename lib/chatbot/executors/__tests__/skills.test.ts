/**
 * @jest-environment node
 */

import { assertAdmin } from "@/lib/admin"
import { docUrl, readDocResult, type KnowledgeRepo } from "@/lib/chatbot/knowledge/github"
import type { SkillCatalog, SkillEntry, SkillProblem } from "@/lib/chatbot/skills/catalog"
import { loadSkillCatalogWithin } from "@/lib/chatbot/skills/within"
import { logAuditEvent } from "@/lib/security/audit-log"
import { sanitizeValue } from "@/lib/utils/log-redaction"

import { executeSkillTool } from "../skills"

jest.mock("@/lib/admin", () => ({ assertAdmin: jest.fn() }))
jest.mock("@/lib/security/audit-log", () => ({ AuditEventType: { ASSISTANT_DATA_READ: "ASSISTANT_DATA_READ" }, logAuditEvent: jest.fn() }))
jest.mock("@/lib/chatbot/skills/within", () => ({ loadSkillCatalogWithin: jest.fn() }))
jest.mock("@/lib/chatbot/knowledge/github", () => ({
  ...jest.requireActual<object>("@/lib/chatbot/knowledge/github"),
  readDocResult: jest.fn(),
}))
const mockWarn = jest.fn()
jest.mock("@/lib/utils/logger", () => ({
  createLogger: () => ({ debug: jest.fn(), info: jest.fn(), error: jest.fn(), warn: (...args: unknown[]) => mockWarn(...args) }),
}))

const SHA = "c".repeat(40)
const COULD_NOT_READ = { error: "The skills could not be read from GitHub right now. Try again in a minute." }
const NOT_CONFIGURED = { error: "No skills are configured. Add a skill source in Settings, Assistant sources." }
const SKILL_NOT_FOUND = { error: "That skill was not found." }
const FILE_NOT_FOUND = { error: "That file was not found in the skill." }
const FILE_UNREADABLE = { error: "Could not read that file from GitHub." }

/** A source as the catalogue hands it over: at the resolved commit. */
const OPS: SkillEntry["source"] = { id: "src-ops", name: "Ops", repo: "octo/skills", ref: SHA, path: "", token: null, updatedAt: new Date(1) }

/** A listed skill whose `SKILL.md` sits in `folder` (`""` at the repo root). */
function skill(name: string, folder: string, over: Partial<SkillEntry> = {}): SkillEntry {
  const source = over.source ?? OPS
  const path = folder ? `${folder}/SKILL.md` : "SKILL.md"
  return { name, description: `Does ${name}`, source, sha: SHA, path, folder, files: [], filesTruncated: false, url: docUrl(source, path), ...over }
}

const TRIAGE = skill("triage", "triage", { files: ["notes.md"] })

const catalogOf = (skills: SkillEntry[], problems: SkillProblem[] = []): SkillCatalog => ({
  skills,
  problems,
  sources: [{ id: OPS.id, name: OPS.name, sha: SHA, pinned: false }],
})
const catalogIs = (catalog: SkillCatalog | null) => jest.mocked(loadSkillCatalogWithin).mockResolvedValue(catalog)

const skillFile = (name: string, body: string) => `---\nname: ${name}\ndescription: Does ${name}\n---\n${body}`
/** GitHub at {@link SHA}: these repo paths read back as this text; any other is not listed. */
const github = (files: Record<string, string>) =>
  jest
    .mocked(readDocResult)
    .mockImplementation(async (_source: KnowledgeRepo, path: string) => (path in files ? { ok: true, text: files[path] } : { ok: false, reason: "not_listed" }))

const run = async (toolName: string, args: Record<string, unknown>) => JSON.parse(await executeSkillTool(toolName, args, "admin-1"))
const auditedDetails = () => jest.mocked(logAuditEvent).mock.calls.map(([, , details]) => details)

beforeEach(() => {
  jest.clearAllMocks()
  jest.mocked(readDocResult).mockReset()
  jest.mocked(assertAdmin).mockResolvedValue({} as never)
  catalogIs(catalogOf([TRIAGE]))
})

describe("load_skill", () => {
  it("load_skill returns the body and files", async () => {
    github({ "triage/SKILL.md": skillFile("triage", "# Do it") })

    expect(await run("load_skill", { name: "triage" })).toEqual({
      name: "triage",
      source: "Ops",
      url: `https://github.com/octo/skills/blob/${SHA}/triage/SKILL.md`,
      content: "# Do it",
      truncated: false,
      files: ["notes.md"],
      filesTruncated: false,
    })
    expect(readDocResult).toHaveBeenCalledWith(expect.objectContaining({ ref: SHA }), "triage/SKILL.md")
    const details = { toolName: "load_skill", skill: "triage", path: "triage/SKILL.md", commit: `octo/skills@${SHA}` }
    expect(logAuditEvent).toHaveBeenCalledWith("ASSISTANT_DATA_READ", "admin-1", details)
    expect(sanitizeValue(auditedDetails()[0])).toEqual(details)
  })

  it("load_skill caps content", async () => {
    github({ "triage/SKILL.md": skillFile("triage", "x".repeat(13_000)) })

    const out = await run("load_skill", { name: "triage" })

    expect(out.content).toHaveLength(12_000)
    expect(out.truncated).toBe(true)
  })

  it("load_skill refuses unknown and unlisted skills", async () => {
    catalogIs(catalogOf([TRIAGE], [{ source: "Ops", path: "deploy/SKILL.md", reason: "not_in_prompt" }]))
    github({ "deploy/SKILL.md": skillFile("deploy", "# Deploy") })

    expect(await run("load_skill", { name: "nope" })).toEqual(SKILL_NOT_FOUND)
    expect(await run("load_skill", { name: "deploy" })).toEqual(SKILL_NOT_FOUND)
    expect(readDocResult).not.toHaveBeenCalled()
    expect(logAuditEvent).not.toHaveBeenCalled()
  })

  it("load_skill reports a failed read", async () => {
    jest.mocked(readDocResult).mockResolvedValue({ ok: false, reason: "unreachable" })

    expect(await run("load_skill", { name: "triage" })).toEqual(COULD_NOT_READ)
    expect(logAuditEvent).not.toHaveBeenCalled()
    expect(mockWarn).toHaveBeenCalledWith("Skill could not be read", { skill: "triage", reason: "unreachable" })

    // A file that no longer parses is treated the same way
    github({ "triage/SKILL.md": "# No frontmatter" })
    expect(await run("load_skill", { name: "triage" })).toEqual(COULD_NOT_READ)
    expect(logAuditEvent).not.toHaveBeenCalled()
    expect(mockWarn).toHaveBeenLastCalledWith("Skill could not be read", { skill: "triage", reason: "invalid_frontmatter" })
  })
})

describe("read_skill_file", () => {
  it("read_skill_file reads a listed file", async () => {
    github({ "triage/notes.md": "# Notes" })

    const out = await run("read_skill_file", { skill: "triage", path: "notes.md" })

    expect(readDocResult).toHaveBeenCalledWith(expect.objectContaining({ ref: SHA }), "triage/notes.md")
    expect(out).toEqual({ skill: "triage", path: "notes.md", url: `https://github.com/octo/skills/blob/${SHA}/triage/notes.md`, content: "# Notes", truncated: false })
    expect(logAuditEvent).toHaveBeenCalledWith("ASSISTANT_DATA_READ", "admin-1", {
      toolName: "read_skill_file",
      skill: "triage",
      path: "triage/notes.md",
      commit: `octo/skills@${SHA}`,
    })
  })

  it("read_skill_file caps content", async () => {
    github({ "triage/notes.md": "y".repeat(13_000) })

    const out = await run("read_skill_file", { skill: "triage", path: "notes.md" })

    expect(out.content).toHaveLength(12_000)
    expect(out.truncated).toBe(true)
  })

  it("read_skill_file reads a root skill's file", async () => {
    const root = skill("root", "", { files: ["guide.md"] })
    // A source whose folder is skills/ keeps it in the skill's folder, so its files read at skills/...
    const nested = skill("nested", "skills", { source: { ...OPS, id: "src-docs", name: "Docs", path: "skills" }, files: ["guide.md"] })
    catalogIs(catalogOf([root, nested]))
    github({ "guide.md": "# Root guide", "skills/guide.md": "# Nested guide" })

    const rootOut = await run("read_skill_file", { skill: "root", path: "guide.md" })
    const nestedOut = await run("read_skill_file", { skill: "nested", path: "guide.md" })

    expect(readDocResult).toHaveBeenNthCalledWith(1, expect.objectContaining({ id: "src-ops" }), "guide.md")
    expect(rootOut).toMatchObject({ skill: "root", path: "guide.md", content: "# Root guide" })
    expect(rootOut.url).toMatch(new RegExp(`/blob/${SHA}/guide\\.md$`))
    expect(readDocResult).toHaveBeenNthCalledWith(2, expect.objectContaining({ id: "src-docs" }), "skills/guide.md")
    expect(nestedOut).toMatchObject({ skill: "nested", path: "guide.md", content: "# Nested guide" })
    expect(nestedOut.url).toMatch(new RegExp(`/blob/${SHA}/skills/guide\\.md$`))
    expect(auditedDetails().map((details) => details?.path)).toEqual(["guide.md", "skills/guide.md"])
  })

  it("read_skill_file needs an exact listed path", async () => {
    github({ "triage/notes.md": "# Notes", "x.md": "# Outside" })

    for (const path of ["../x.md", "Notes.md", "./notes.md", "triage/notes.md"]) {
      expect(await run("read_skill_file", { skill: "triage", path })).toEqual(FILE_NOT_FOUND)
    }
    expect(readDocResult).not.toHaveBeenCalled()
    expect(logAuditEvent).not.toHaveBeenCalled()
  })

  it("reports a failed file read", async () => {
    jest.mocked(readDocResult).mockResolvedValue({ ok: false, reason: "rate_limited" })

    expect(await run("read_skill_file", { skill: "triage", path: "notes.md" })).toEqual(FILE_UNREADABLE)
    expect(logAuditEvent).not.toHaveBeenCalled()
    expect(mockWarn).toHaveBeenCalledWith("Skill file could not be read", { skill: "triage", path: "triage/notes.md", reason: "rate_limited" })
  })

  it("refuses a file of an unknown skill", async () => {
    expect(await run("read_skill_file", { skill: "nope", path: "notes.md" })).toEqual(SKILL_NOT_FOUND)
    expect(readDocResult).not.toHaveBeenCalled()
  })
})

describe("both tools", () => {
  it("never returns the token", async () => {
    const source = { ...OPS, token: "ghp_secret" }
    const secret = skill("triage", "triage", { source, files: ["notes.md"] })
    const results: string[] = []
    const collect = async (toolName: string, args: Record<string, unknown>) => results.push(await executeSkillTool(toolName, args, "admin-1"))

    catalogIs(catalogOf([secret]))
    github({ "triage/SKILL.md": skillFile("triage", "# Do it"), "triage/notes.md": "# Notes" })
    await collect("load_skill", { name: "triage" })
    await collect("read_skill_file", { skill: "triage", path: "notes.md" })
    await collect("load_skill", { name: "nope" })
    await collect("read_skill_file", { skill: "triage", path: "other.md" })
    await collect("load_skill", { name: "" })
    jest.mocked(readDocResult).mockResolvedValue({ ok: false, reason: "unreachable" })
    await collect("load_skill", { name: "triage" })
    await collect("read_skill_file", { skill: "triage", path: "notes.md" })
    catalogIs({ skills: [], problems: [], sources: [] })
    await collect("load_skill", { name: "triage" })
    catalogIs(null)
    await collect("read_skill_file", { skill: "triage", path: "notes.md" })

    expect(results).toHaveLength(9)
    for (const result of results) {
      expect(JSON.stringify(result)).not.toContain("ghp_secret")
      expect(result).not.toMatch(/"token"\s*:/)
    }
  })

  it("audits a long skill name with its path intact", async () => {
    const name = "a".repeat(40)
    catalogIs(catalogOf([skill(name, name, { files: ["notes.md"] })]))
    github({ [`${name}/SKILL.md`]: skillFile(name, "# Do it"), [`${name}/notes.md`]: "# Notes" })

    await run("load_skill", { name })
    await run("read_skill_file", { skill: name, path: "notes.md" })

    const [loaded, read] = auditedDetails().map((details) => sanitizeValue(details) as Record<string, unknown>)
    expect(loaded).toMatchObject({ toolName: "load_skill", path: `${name}/SKILL.md`, commit: `octo/skills@${SHA}` })
    expect(read).toMatchObject({ toolName: "read_skill_file", path: `${name}/notes.md`, commit: `octo/skills@${SHA}` })
  })

  it("says when no skill source is configured", async () => {
    catalogIs({ skills: [], problems: [], sources: [] })

    expect(await run("load_skill", { name: "triage" })).toEqual(NOT_CONFIGURED)
    expect(await run("read_skill_file", { skill: "triage", path: "notes.md" })).toEqual(NOT_CONFIGURED)
  })

  it("says when GitHub is too slow", async () => {
    catalogIs(null)

    expect(await run("load_skill", { name: "triage" })).toEqual(COULD_NOT_READ)
    expect(await run("read_skill_file", { skill: "triage", path: "notes.md" })).toEqual(COULD_NOT_READ)
    expect(readDocResult).not.toHaveBeenCalled()
  })

  it("rejects bad arguments", async () => {
    expect(await executeSkillTool("load_skill", { name: "" }, "admin-1")).toBe("Error: Invalid tool arguments")
    expect(await executeSkillTool("load_skill", { name: "x".repeat(65) }, "admin-1")).toBe("Error: Invalid tool arguments")
    expect(await executeSkillTool("read_skill_file", { skill: "triage" }, "admin-1")).toBe("Error: Invalid tool arguments")
    // Checked before the catalogue, so a malformed call never waits on GitHub
    expect(loadSkillCatalogWithin).not.toHaveBeenCalled()
  })

  it("refuses a non-admin", async () => {
    jest.mocked(assertAdmin).mockRejectedValue(new Error("PM_FORBIDDEN"))

    await expect(executeSkillTool("load_skill", { name: "triage" }, "member-1")).rejects.toThrow("PM_FORBIDDEN")
    await expect(executeSkillTool("read_skill_file", { skill: "triage", path: "notes.md" }, "member-1")).rejects.toThrow("PM_FORBIDDEN")
    expect(loadSkillCatalogWithin).not.toHaveBeenCalled()
  })

  it("answers an unknown tool name", async () => {
    expect(await executeSkillTool("load_skills", { name: "triage" }, "admin-1")).toBe("Error: Unknown tool")
    expect(loadSkillCatalogWithin).not.toHaveBeenCalled()
  })
})
