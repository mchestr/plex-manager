import { mockReset } from "jest-mock-extended"

import { prismaMock } from "@/__tests__/helpers/prisma-mock"
import { assertAdmin } from "@/lib/admin"
import { getAssistantFailedJobs, getAssistantInvites, getAssistantMember } from "@/lib/data/assistant-data"

jest.mock("@/lib/admin", () => ({ assertAdmin: jest.fn() }))
jest.mock("@/lib/prisma", () => require("@/__tests__/helpers/prisma-mock").prismaModule)
jest.mock("@/lib/admin/queues", () => ({ listQueueJobs: jest.fn() }))
jest.mock("@/lib/queue/connection", () => ({ isRedisConfigured: jest.fn().mockReturnValue(false) }))

const forbidden = new Error("PM_FORBIDDEN")

describe("assistant data loaders", () => {
  beforeEach(() => {
    mockReset(prismaMock)
    jest.mocked(assertAdmin).mockReset().mockResolvedValue({} as never)
  })

  it.each([
    ["invites", () => getAssistantInvites()],
    ["member", () => getAssistantMember({ query: "sam" })],
    ["failed jobs", () => getAssistantFailedJobs()],
  ])("%s refuse a non-admin before reading", async (_name, load) => {
    jest.mocked(assertAdmin).mockRejectedValue(forbidden)
    await expect(load()).rejects.toBe(forbidden)
    expect(prismaMock.invite.findMany).not.toHaveBeenCalled()
    expect(prismaMock.user.findMany).not.toHaveBeenCalled()
  })

  it("filters by status in the query, so the limit counts matching invites", async () => {
    prismaMock.invite.findMany.mockResolvedValue([])
    await getAssistantInvites({ status: "active", limit: 5 })
    const args = prismaMock.invite.findMany.mock.calls[0][0]
    expect(args?.take).toBe(5)
    expect(JSON.stringify(args?.where)).toContain("expiresAt")
  })

  it("keeps the expired filter when expiresWithinDays is also given", async () => {
    prismaMock.invite.findMany.mockResolvedValue([])
    await getAssistantInvites({ status: "expired", expiresWithinDays: 7 })
    const where = prismaMock.invite.findMany.mock.calls[0][0]?.where as { AND: Array<Record<string, { lt?: Date; gte?: Date; lte?: Date }>> }
    expect(where.AND).toHaveLength(2)
    expect(where.AND[0].expiresAt.lt).toBeInstanceOf(Date)
    expect(where.AND[1].expiresAt.gte).toBeInstanceOf(Date)
    expect(where.AND[1].expiresAt.lte).toBeInstanceOf(Date)
  })

  it("shows only the end of an invite code", async () => {
    prismaMock.invite.findMany.mockResolvedValue([
      { id: "i1", code: "SECRETCODE1234", serverType: "PLEX", maxUses: 1, useCount: 0, expiresAt: null, createdAt: new Date() },
    ] as never)
    const result = await getAssistantInvites()
    expect(result.invites[0]).toMatchObject({ id: "i1", codeEnd: "1234" })
    expect(JSON.stringify(result)).not.toContain("SECRETCODE")
  })

  it("lists candidates when a query matches several members", async () => {
    prismaMock.user.findMany.mockResolvedValue([
      { id: "1", name: "Sam A" },
      { id: "2", name: "Sam B" },
    ] as never)
    const result = await getAssistantMember({ query: "sam" })
    expect(result).toEqual({ found: false, candidates: [{ id: "1", name: "Sam A" }, { id: "2", name: "Sam B" }] })
  })

  it("returns a member without plex or jellyfin ids", async () => {
    prismaMock.user.findMany.mockResolvedValue([{ id: "1", name: "Sam" }] as never)
    prismaMock.user.findUnique.mockResolvedValue({ id: "1", name: "Sam", plexUserId: "9", jellyfinUserId: null, exemptReason: null, plexWrapped: [], rewindGenerations: [] } as never)
    const result = await getAssistantMember({ query: "Sam" })
    expect(result).toMatchObject({ found: true, member: { services: ["plex"], hasPlexAccount: true } })
    expect(JSON.stringify(result)).not.toContain('"plexUserId"')
  })

  it("removes email addresses from free text and cuts it", async () => {
    prismaMock.user.findMany.mockResolvedValue([{ id: "1", name: "Sam" }] as never)
    prismaMock.user.findUnique.mockResolvedValue({
      id: "1",
      name: "Sam",
      plexUserId: null,
      jellyfinUserId: null,
      exemptReason: "friend of sam@example.com",
      plexWrapped: [{ year: 2026, status: "failed", error: `bad ${"x".repeat(500)}`, generatedAt: null }],
      rewindGenerations: [{ year: 2026, kind: "season", status: "failed", error: { code: "LLM_FAILED", detail: "mail a@b.co" } }],
    } as never)

    const text = JSON.stringify(await getAssistantMember({ query: "Sam" }))

    expect(text).not.toContain("sam@example.com")
    expect(text).not.toContain("a@b.co")
    expect(text).toContain("[email]")
    expect(text).not.toContain("x".repeat(250))
  })

  it("asks for at least two characters", async () => {
    await expect(getAssistantMember({ query: "a" })).rejects.toThrow()
  })

  it("reports no Redis without reading the queue", async () => {
    expect(await getAssistantFailedJobs()).toEqual({ redisConfigured: false, total: 0, jobs: [] })
  })
})
