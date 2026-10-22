/**
 * The admin history viewer: which version is current, rebuilding v1 and v2
 * versions, and versions whose LLM text the October 2026 privacy clean-up
 * removed (P0.20), which stay listed and open as `removed`.
 */

jest.mock("server-only", () => ({}))

import { getHistoricalWrappedData, getHistoricalWrappedVersions } from "@/lib/admin/rewind-history"
import { prisma } from "@/lib/prisma"
import { assembleWrappedData } from "@/lib/wrapped/assemble-wrapped"
import { pickCurrentUsageId } from "@/lib/wrapped/data/history"
import { buildStatistics, buildValidOutput } from "@/lib/wrapped/__tests__/fixtures"
import { mockReset } from 'jest-mock-extended'
import { prismaMock } from '@/__tests__/helpers/prisma-mock'

jest.mock("@/lib/admin", () => ({
  assertAdmin: jest.fn().mockResolvedValue({ user: { id: "admin-1", isAdmin: true } }),
}))

jest.mock('@/lib/prisma', () => require('@/__tests__/helpers/prisma-mock').prismaModule)

beforeEach(() => mockReset(prismaMock))

const mockWrappedFindUnique = prisma.plexWrapped.findUnique as jest.Mock
const mockUsageFindMany = prisma.lLMUsage.findMany as jest.Mock
const mockUsageFindUnique = prisma.lLMUsage.findUnique as jest.Mock

const user = { id: "user-1", name: "Mike", email: "mike@example.com" }

function usageRecord(id: string, response: string | null, createdAt = "2025-12-01T00:00:00Z") {
  return {
    id,
    userId: "user-1",
    wrappedId: "wrapped-1",
    createdAt: new Date(createdAt),
    provider: "openai",
    model: "gpt-5-mini",
    cost: 0.01,
    totalTokens: 1000,
    prompt: response === null ? null : "prompt",
    response,
    user,
  }
}

/** A stored v2 Rewind, as generation writes it. */
function storedV2() {
  return JSON.stringify(
    assembleWrappedData({ output: buildValidOutput(), statistics: buildStatistics(), userId: "user-1", userName: "Mike", year: 2025 })
  )
}

describe("pickCurrentUsageId", () => {
  const records = [
    { id: "retry", createdAt: new Date("2025-12-02T10:00:00Z") },
    { id: "second", createdAt: new Date("2025-12-01T12:00:00Z") },
    { id: "first", createdAt: new Date("2025-12-01T10:00:00Z") },
  ]

  it("picks the newest usage row at or before generatedAt", () => {
    expect(pickCurrentUsageId(records, new Date("2025-12-01T12:00:05Z"))).toBe("second")
    expect(pickCurrentUsageId(records, new Date("2025-12-01T12:00:00Z"))).toBe("second")
  })

  it("does not depend on the order of the rows", () => {
    expect(pickCurrentUsageId([...records].reverse(), new Date("2025-12-03T00:00:00Z"))).toBe("retry")
  })

  it("returns null when the Rewind was never generated or every row is newer", () => {
    expect(pickCurrentUsageId(records, null)).toBeNull()
    expect(pickCurrentUsageId(records, new Date("2025-11-30T00:00:00Z"))).toBeNull()
  })

  it("matches the JSDoc example", () => {
    expect(
      pickCurrentUsageId(
        [
          { id: "retry", createdAt: new Date("2026-12-02T10:00:00Z") },
          { id: "first", createdAt: new Date("2026-12-01T10:00:00Z") },
        ],
        new Date("2026-12-01T10:00:05Z")
      )
    ).toBe("first")
  })
})

describe("getHistoricalWrappedVersions", () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it("lists versions with removed text and leaves out empty responses", async () => {
    mockWrappedFindUnique.mockResolvedValue({ generatedAt: new Date("2025-12-01T00:00:10Z") })
    mockUsageFindMany.mockResolvedValue([])

    await getHistoricalWrappedVersions("wrapped-1")

    expect(mockUsageFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { wrappedId: "wrapped-1", OR: [{ response: null }, { response: { not: "" } }] },
      })
    )
  })

  it("marks the v2 version picked by generatedAt as current, not the newest row", async () => {
    const output = JSON.stringify(buildValidOutput())
    mockWrappedFindUnique.mockResolvedValue({ generatedAt: new Date("2025-12-01T00:00:10Z") })
    mockUsageFindMany.mockResolvedValue([
      usageRecord("usage-3", output, "2025-12-05T00:00:00Z"),
      usageRecord("usage-2", output, "2025-12-01T00:00:00Z"),
      usageRecord("usage-1", output, "2025-11-30T00:00:00Z"),
    ])

    const versions = await getHistoricalWrappedVersions("wrapped-1")

    expect(versions.map((v) => [v.id, v.isCurrent])).toEqual([
      ["usage-3", false],
      ["usage-2", true],
      ["usage-1", false],
    ])
  })

  it("keeps a version with removed text listed, with a null response", async () => {
    mockWrappedFindUnique.mockResolvedValue({ generatedAt: new Date("2025-12-01T00:00:10Z") })
    mockUsageFindMany.mockResolvedValue([
      usageRecord("usage-2", null),
      usageRecord("usage-1", JSON.stringify({ summary: "Older summary", sections: [] }), "2025-11-01T00:00:00Z"),
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

  function withWrapped(response: string | null, data = JSON.stringify({ statistics: { moviesWatched: 3 } })) {
    return {
      ...usageRecord("usage-1", response),
      wrapped: { id: "wrapped-1", year: 2025, data },
    }
  }

  it("returns the version's header and removed when the text was removed", async () => {
    mockUsageFindUnique.mockResolvedValue(withWrapped(null))

    const result = await getHistoricalWrappedData("usage-1", "wrapped-1")

    expect(result).toEqual({
      year: 2025,
      userId: "user-1",
      userName: "Mike",
      removed: true,
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

  it("rebuilds a v2 version through the v2 schema and assembly, on the stored statistics", async () => {
    const output = buildValidOutput()
    output.summary = "An older summary"
    mockUsageFindUnique.mockResolvedValue(withWrapped("```json\n" + JSON.stringify(output) + "\n```", storedV2()))

    const result = await getHistoricalWrappedData("usage-1", "wrapped-1")

    if (!result || result.removed) throw new Error("expected a rebuilt version")
    expect(result.wrappedData).toMatchObject({
      version: 2,
      year: 2025,
      summary: "An older summary",
      generatedAt: "2025-12-01T00:00:00.000Z",
      archetype: { id: "midnight-marathoner" },
      statistics: { moviesWatched: 85 },
    })
    expect(result.wrappedData.sections.map((section) => section.type)).toContain("archetype-reveal")
    expect(result.wrappedData.statistics).not.toHaveProperty("leaderboards")
  })

  it("still rebuilds a v1 version from its sections", async () => {
    mockUsageFindUnique.mockResolvedValue(
      withWrapped(JSON.stringify({ summary: "Old", sections: [{ id: "hero", type: "hero", title: "Hi", content: "x" }] }))
    )

    const result = await getHistoricalWrappedData("usage-1", "wrapped-1")

    if (!result || result.removed) throw new Error("expected a rebuilt version")
    expect(result.wrappedData).toMatchObject({
      year: 2025,
      userName: "Mike",
      summary: "Old",
      sections: [{ id: "hero", type: "hero" }],
      statistics: { moviesWatched: 3 },
    })
  })

  it("uses zeroed statistics when the current row does not parse", async () => {
    mockUsageFindUnique.mockResolvedValue(withWrapped(JSON.stringify(buildValidOutput()), "not json"))

    const result = await getHistoricalWrappedData("usage-1", "wrapped-1")

    if (!result || result.removed) throw new Error("expected a rebuilt version")
    expect(result.wrappedData.statistics).toMatchObject({ moviesWatched: 0, topMovies: [], totalWatchTime: { total: 0 } })
  })

  it("returns null for a response that is neither a v1 nor a v2 version", async () => {
    mockUsageFindUnique.mockResolvedValue(withWrapped("I cannot help with that"))

    expect(await getHistoricalWrappedData("usage-1", "wrapped-1")).toBeNull()
  })
})
