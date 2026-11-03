/**
 * @jest-environment node
 *
 * Skill source actions: admin only, the repository, ref and folder checked as
 * for knowledge bases, a commit SHA saved in lowercase, a token kept when left
 * blank and never returned, and every change audited without it.
 */

import { mockReset } from "jest-mock-extended"
import { getServerSession } from "next-auth"
import { revalidatePath } from "next/cache"

import { checkSkills, deleteSkillSource, refreshSkillSource, saveSkillSource } from "@/actions/admin/assistant-skills"
import { buildSkillSource } from "@/__tests__/helpers/factories"
import { prismaMock } from "@/__tests__/helpers/prisma-mock"
import { loadSkillCatalog, type SkillCatalog } from "@/lib/chatbot/skills/catalog"
import { AuditEventType, logAuditEvent } from "@/lib/security/audit-log"
import { consume } from "@/lib/security/rate-limit"

jest.mock("next-auth", () => ({ getServerSession: jest.fn() }))
jest.mock("@/lib/auth", () => ({ authOptions: {} }))
jest.mock("@/lib/prisma", () => require("@/__tests__/helpers/prisma-mock").prismaModule)
jest.mock("next/cache", () => ({ revalidatePath: jest.fn() }))
jest.mock("@/lib/security/rate-limit", () => ({ consume: jest.fn(), actionClientIp: jest.fn() }))
jest.mock("@/lib/security/audit-log", () => ({
  ...jest.requireActual("@/lib/security/audit-log"),
  logAuditEvent: jest.fn(),
}))
jest.mock("@/lib/chatbot/skills/catalog", () => ({ loadSkillCatalog: jest.fn() }))

const SHA = "c".repeat(40)
const SKILLS = { name: "Ops", repo: "octo/skills", ref: "main", path: "/skills/", token: "", isActive: true }

beforeEach(() => {
  mockReset(prismaMock)
  jest.clearAllMocks()
  jest.mocked(getServerSession).mockResolvedValue({ user: { id: "admin-1", isAdmin: true } })
  jest.mocked(consume).mockResolvedValue({ ok: true })
  prismaMock.skillSource.findFirst.mockResolvedValue(null)
})

describe("the skill source actions", () => {
  it("refuses a member", async () => {
    jest.mocked(getServerSession).mockResolvedValue({ user: { id: "m", isAdmin: false } })

    const results = [await saveSkillSource(SKILLS), await deleteSkillSource({ id: "s1" }), await refreshSkillSource({ id: "s1" }), await checkSkills()]

    for (const result of results) expect(result).toMatchObject({ success: false, code: "FORBIDDEN" })
    expect(prismaMock.skillSource.create).not.toHaveBeenCalled()
    expect(prismaMock.skillSource.update).not.toHaveBeenCalled()
    expect(prismaMock.skillSource.deleteMany).not.toHaveBeenCalled()
    expect(loadSkillCatalog).not.toHaveBeenCalled()
    expect(logAuditEvent).not.toHaveBeenCalled()
  })
})

describe("saveSkillSource", () => {
  it("saves a source and audits it", async () => {
    prismaMock.skillSource.create.mockResolvedValue(buildSkillSource({ id: "s1", path: "skills" }))

    const result = await saveSkillSource(SKILLS)

    expect(result).toEqual({ success: true, data: { id: "s1" } })
    expect(prismaMock.skillSource.create).toHaveBeenCalledWith({
      data: { name: "Ops", repo: "octo/skills", ref: "main", path: "skills", token: null, isActive: true },
    })
    expect(logAuditEvent).toHaveBeenCalledWith(AuditEventType.ASSISTANT_SOURCE_CHANGED, "admin-1", { kind: "skill", action: "saved", id: "s1" })
    expect(revalidatePath).toHaveBeenCalledWith("/admin/ai/settings")
  })

  it("saves a 40-hex ref in lowercase", async () => {
    prismaMock.skillSource.create.mockResolvedValue(buildSkillSource({ id: "s1" }))

    await saveSkillSource({ ...SKILLS, ref: `ABC${"D".repeat(37)}` })
    // A branch or tag keeps its case: only a full commit SHA is lowercased
    await saveSkillSource({ ...SKILLS, ref: "Release-1" })

    expect(prismaMock.skillSource.create).toHaveBeenNthCalledWith(1, { data: expect.objectContaining({ ref: `abc${"d".repeat(37)}` }) })
    expect(prismaMock.skillSource.create).toHaveBeenNthCalledWith(2, { data: expect.objectContaining({ ref: "Release-1" }) })
  })

  it("keeps the stored token when blank", async () => {
    prismaMock.skillSource.findUnique.mockResolvedValue(buildSkillSource({ id: "s1", token: "ghp_old" }))
    prismaMock.skillSource.update.mockResolvedValue(buildSkillSource({ id: "s1", token: "ghp_old" }))

    const result = await saveSkillSource({ ...SKILLS, id: "s1", token: "" })

    expect(prismaMock.skillSource.update).toHaveBeenCalledWith({ where: { id: "s1" }, data: expect.objectContaining({ token: "ghp_old" }) })
    expect(result).toEqual({ success: true, data: { id: "s1" } })
  })

  it("saves a new token", async () => {
    prismaMock.skillSource.findUnique.mockResolvedValue(buildSkillSource({ id: "s1", token: "ghp_old" }))
    prismaMock.skillSource.update.mockResolvedValue(buildSkillSource({ id: "s1", token: "ghp_new" }))

    const result = await saveSkillSource({ ...SKILLS, id: "s1", token: " ghp_new " })

    expect(prismaMock.skillSource.update).toHaveBeenCalledWith({ where: { id: "s1" }, data: expect.objectContaining({ token: "ghp_new" }) })
    expect(JSON.stringify(result)).not.toContain("ghp_")
  })

  it("reports an unknown id", async () => {
    prismaMock.skillSource.findUnique.mockResolvedValue(null)

    expect(await saveSkillSource({ ...SKILLS, id: "gone" })).toMatchObject({ success: false, code: "NOT_FOUND" })
    expect(prismaMock.skillSource.update).not.toHaveBeenCalled()
    expect(prismaMock.skillSource.create).not.toHaveBeenCalled()
    expect(logAuditEvent).not.toHaveBeenCalled()
  })

  it("rejects a name in use", async () => {
    prismaMock.skillSource.findFirst.mockResolvedValue(buildSkillSource({ id: "other" }))

    expect(await saveSkillSource(SKILLS)).toMatchObject({ success: false, code: "CONFLICT", fieldErrors: { name: expect.any(Array) } })
    expect(prismaMock.skillSource.create).not.toHaveBeenCalled()
  })

  it("validates repo and ref", async () => {
    for (const repo of ["../x", "owner"]) {
      expect(await saveSkillSource({ ...SKILLS, repo })).toMatchObject({ success: false, code: "VALIDATION", fieldErrors: { repo: expect.any(Array) } })
    }
    for (const ref of ["", "two words", "main?x"]) {
      expect(await saveSkillSource({ ...SKILLS, ref })).toMatchObject({ success: false, code: "VALIDATION", fieldErrors: { ref: expect.any(Array) } })
    }
    expect(prismaMock.skillSource.create).not.toHaveBeenCalled()
  })
})

describe("refreshSkillSource", () => {
  it("refreshes by bumping updatedAt", async () => {
    prismaMock.skillSource.findUnique.mockResolvedValue(buildSkillSource({ id: "s1" }))
    prismaMock.skillSource.update.mockResolvedValue(buildSkillSource({ id: "s1" }))

    expect(await refreshSkillSource({ id: "s1" })).toEqual({ success: true, data: null })
    expect(prismaMock.skillSource.update).toHaveBeenCalledWith({ where: { id: "s1" }, data: { updatedAt: expect.any(Date) } })
    expect(logAuditEvent).toHaveBeenCalledWith(AuditEventType.ASSISTANT_SOURCE_CHANGED, "admin-1", { kind: "skill", action: "refreshed", id: "s1" })
    expect(revalidatePath).toHaveBeenCalledWith("/admin/ai/settings")

    jest.clearAllMocks()
    prismaMock.skillSource.findUnique.mockResolvedValue(null)

    expect(await refreshSkillSource({ id: "gone" })).toMatchObject({ success: false, code: "NOT_FOUND" })
    expect(prismaMock.skillSource.update).not.toHaveBeenCalled()
    expect(logAuditEvent).not.toHaveBeenCalled()
  })
})

describe("deleteSkillSource", () => {
  it("deletes and audits", async () => {
    prismaMock.skillSource.deleteMany.mockResolvedValue({ count: 1 })

    expect(await deleteSkillSource({ id: "s1" })).toEqual({ success: true, data: null })
    expect(prismaMock.skillSource.deleteMany).toHaveBeenCalledWith({ where: { id: "s1" } })
    expect(logAuditEvent).toHaveBeenCalledWith(AuditEventType.ASSISTANT_SOURCE_CHANGED, "admin-1", { kind: "skill", action: "deleted", id: "s1" })
    expect(revalidatePath).toHaveBeenCalledWith("/admin/ai/settings")

    jest.mocked(logAuditEvent).mockClear()
    prismaMock.skillSource.deleteMany.mockResolvedValue({ count: 0 })

    expect(await deleteSkillSource({ id: "s1" })).toMatchObject({ success: false, code: "NOT_FOUND" })
    expect(logAuditEvent).not.toHaveBeenCalled()
  })
})

describe("checkSkills", () => {
  it("checkSkills never returns a token", async () => {
    const source = { id: "s1", name: "Ops", repo: "octo/skills", ref: SHA, path: "", token: "ghp_secret", updatedAt: new Date(1) }
    const catalog: SkillCatalog = {
      skills: [
        {
          name: "triage",
          description: "Triage a failed Rewind",
          source,
          sha: SHA,
          path: "triage/SKILL.md",
          folder: "triage",
          files: ["notes.md"],
          filesTruncated: false,
          url: `https://github.com/octo/skills/blob/${SHA}/triage/SKILL.md`,
        },
      ],
      problems: [{ source: "Ops", path: "bad/SKILL.md", reason: "invalid_frontmatter", detail: "name must match" }],
      sources: [{ id: "s1", name: "Ops", sha: SHA, pinned: false }],
    }
    jest.mocked(loadSkillCatalog).mockResolvedValue(catalog)

    const result = await checkSkills()

    // The full load, with no five-second bound: a diagnosis waits for every source
    expect(loadSkillCatalog).toHaveBeenCalledWith()
    expect(result).toEqual({
      success: true,
      data: {
        sources: [{ name: "Ops", sha: SHA, pinned: false }],
        skills: [{ name: "triage", source: "Ops", path: "triage/SKILL.md" }],
        problems: [{ source: "Ops", path: "bad/SKILL.md", reason: "invalid_frontmatter", detail: "name must match" }],
      },
    })
    expect(JSON.stringify(result)).not.toContain('"token"')
    expect(JSON.stringify(result)).not.toContain("ghp_")
  })
})
