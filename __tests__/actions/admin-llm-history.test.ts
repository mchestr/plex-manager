/**
 * Historical Rewind versions whose LLM text the October 2026 privacy clean-up
 * removed (P0.20): they stay listed, and opening one yields no wrapped data
 * instead of a parse failure.
 */

import { getHistoricalWrappedData, getHistoricalWrappedVersions } from "@/actions/admin/admin-llm-history"
import { prisma } from "@/lib/prisma"

jest.mock("@/lib/admin", () => ({
  requireAdmin: jest.fn().mockResolvedValue({ user: { id: "admin-1", isAdmin: true } }),
}))

jest.mock("@/lib/prisma", () => ({
  prisma: {
    plexWrapped: { findUnique: jest.fn() },
    lLMUsage: { findMany: jest.fn(), findUnique: jest.fn() },
  },
}))

const mockWrappedFindUnique = prisma.plexWrapped.findUnique as jest.Mock
const mockUsageFindMany = prisma.lLMUsage.findMany as jest.Mock
const mockUsageFindUnique = prisma.lLMUsage.findUnique as jest.Mock

const user = { id: "user-1", name: "Mike", email: "mike@example.com" }

function usageRecord(id: string, response: string | null) {
  return {
    id,
    userId: "user-1",
    wrappedId: "wrapped-1",
    createdAt: new Date("2025-12-01T00:00:00Z"),
    provider: "openai",
    model: "gpt-5-mini",
    cost: 0.01,
    totalTokens: 1000,
    prompt: response === null ? null : "prompt",
    response,
    user,
  }
}

describe("getHistoricalWrappedVersions", () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockWrappedFindUnique.mockResolvedValue({ data: JSON.stringify({ summary: "Current summary", sections: [] }) })
  })

  it("lists versions with removed text and leaves out empty responses", async () => {
    mockUsageFindMany.mockResolvedValue([])

    await getHistoricalWrappedVersions("wrapped-1")

    expect(mockUsageFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { wrappedId: "wrapped-1", OR: [{ response: null }, { response: { not: "" } }] },
      })
    )
  })

  it("returns a removed version with a null response, treating the latest as current", async () => {
    mockUsageFindMany.mockResolvedValue([
      usageRecord("usage-2", null),
      usageRecord("usage-1", JSON.stringify({ summary: "Older summary", sections: [] })),
    ])

    const versions = await getHistoricalWrappedVersions("wrapped-1")

    expect(versions.map((v) => ({ id: v.id, response: v.response, isCurrent: v.isCurrent }))).toEqual([
      { id: "usage-2", response: null, isCurrent: true },
      { id: "usage-1", response: JSON.stringify({ summary: "Older summary", sections: [] }), isCurrent: false },
    ])
  })
})

describe("getHistoricalWrappedData", () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  function withWrapped(response: string | null) {
    return {
      ...usageRecord("usage-1", response),
      wrapped: { id: "wrapped-1", year: 2025, data: JSON.stringify({ statistics: { moviesWatched: 3 } }) },
    }
  }

  it("returns the version's header and no wrapped data when the text was removed", async () => {
    mockUsageFindUnique.mockResolvedValue(withWrapped(null))

    const result = await getHistoricalWrappedData("usage-1", "wrapped-1")

    expect(result).toEqual({
      year: 2025,
      userId: "user-1",
      userName: "Mike",
      wrappedData: null,
      llmUsage: {
        id: "usage-1",
        createdAt: new Date("2025-12-01T00:00:00Z"),
        provider: "openai",
        model: "gpt-5-mini",
        cost: 0.01,
        totalTokens: 1000,
      },
    })
  })

  it("still rebuilds the wrapped data from a response that has text", async () => {
    mockUsageFindUnique.mockResolvedValue(withWrapped(JSON.stringify({ summary: "Old", sections: [{ id: "hero" }] })))

    const result = await getHistoricalWrappedData("usage-1", "wrapped-1")

    expect(result?.wrappedData).toMatchObject({
      year: 2025,
      userName: "Mike",
      summary: "Old",
      sections: [{ id: "hero" }],
      statistics: { moviesWatched: 3 },
    })
  })
})
