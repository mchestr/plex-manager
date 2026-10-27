import { mockReset } from "jest-mock-extended"

import { prismaMock } from "@/__tests__/helpers/prisma-mock"
import { assertAdmin } from "@/lib/admin"
import { getAssistantSources } from "@/lib/data/assistant-sources"

jest.mock("@/lib/admin", () => ({ assertAdmin: jest.fn() }))
jest.mock("@/lib/prisma", () => require("@/__tests__/helpers/prisma-mock").prismaModule)

beforeEach(() => {
  mockReset(prismaMock)
  jest.mocked(assertAdmin).mockReset().mockResolvedValue({} as never)
})

describe("getAssistantSources", () => {
  it("refuses a non-admin before reading", async () => {
    jest.mocked(assertAdmin).mockRejectedValue(new Error("PM_FORBIDDEN"))
    await expect(getAssistantSources()).rejects.toThrow("PM_FORBIDDEN")
    expect(prismaMock.mcpServer.findMany).not.toHaveBeenCalled()
  })

  it("never returns a stored secret, only that one is saved", async () => {
    prismaMock.mcpServer.findMany.mockResolvedValue([
      { id: "m1", name: "Memini", url: "https://mcp.example.com/mcp", authHeaderName: "Authorization", authHeaderSecret: "Bearer abcdefgh1234", isActive: true, enabledTools: ["search"] },
    ] as never)
    prismaMock.knowledgeSource.findMany.mockResolvedValue([
      { id: "k1", name: "KB", repo: "a/b", ref: "main", path: "", token: "ghp_abcdefghijkl", isActive: true },
    ] as never)

    const sources = await getAssistantSources()

    expect(sources.mcpServers[0].authSecret).toEqual({ last4: "1234", origin: "https://mcp.example.com" })
    expect(sources.knowledgeSources[0].token).toEqual({ last4: "ijkl", origin: null })
    expect(JSON.stringify(sources)).not.toContain("Bearer abcdefgh")
    expect(JSON.stringify(sources)).not.toContain("ghp_abcdefghijkl")
  })

  it("shows no secret when none is saved", async () => {
    prismaMock.mcpServer.findMany.mockResolvedValue([{ id: "m1", name: "M", url: "https://x.example", authHeaderName: null, authHeaderSecret: null, isActive: true, enabledTools: [] }] as never)
    prismaMock.knowledgeSource.findMany.mockResolvedValue([])
    expect((await getAssistantSources()).mcpServers[0].authSecret).toBeNull()
  })
})
