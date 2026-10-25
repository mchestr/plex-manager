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

  it("keeps only active invites that still have uses left", async () => {
    prismaMock.invite.findMany.mockResolvedValue([
      { code: "a", serverType: "PLEX", maxUses: 1, useCount: 1, expiresAt: null, createdAt: new Date() },
      { code: "b", serverType: "PLEX", maxUses: 2, useCount: 1, expiresAt: null, createdAt: new Date() },
    ] as never)
    const result = await getAssistantInvites({ status: "active" })
    expect(result.invites.map((i) => i.code)).toEqual(["b"])
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
    prismaMock.user.findUnique.mockResolvedValue({ id: "1", name: "Sam", plexUserId: "9", jellyfinUserId: null } as never)
    const result = await getAssistantMember({ query: "Sam" })
    expect(result).toMatchObject({ found: true, member: { services: ["plex"], hasPlexAccount: true } })
    expect(JSON.stringify(result)).not.toContain('"plexUserId"')
  })

  it("reports no Redis without reading the queue", async () => {
    expect(await getAssistantFailedJobs()).toEqual({ redisConfigured: false, total: 0, jobs: [] })
  })
})
