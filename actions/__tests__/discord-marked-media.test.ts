/**
 * Tests for actions/discord-activity.ts - getDiscordMarkedMedia
 *
 * Covers: admin gating, per-type summary, mark-type/source/search/date filters,
 * pagination, serialization, and error handling.
 */

import { getDiscordMarkedMedia } from "@/actions/discord-activity"
import { requireAdmin } from "@/lib/admin"
import { prisma } from "@/lib/prisma"

jest.mock("@/lib/admin", () => ({
  requireAdmin: jest.fn(),
}))

jest.mock("@/lib/prisma", () => ({
  prisma: {
    userMediaMark: {
      findMany: jest.fn(),
      count: jest.fn(),
      groupBy: jest.fn(),
    },
  },
}))

jest.mock("@/lib/utils/logger", () => ({
  createLogger: () => ({ info: jest.fn(), error: jest.fn(), warn: jest.fn() }),
}))

const mockRequireAdmin = requireAdmin as jest.MockedFunction<typeof requireAdmin>
const findMany = prisma.userMediaMark.findMany as jest.Mock
const count = prisma.userMediaMark.count as jest.Mock
const groupBy = prisma.userMediaMark.groupBy as jest.Mock

function makeRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "mark-1",
    title: "The Office",
    year: 2005,
    mediaType: "TV_SERIES",
    markType: "KEEP_FOREVER",
    seasonNumber: null,
    episodeNumber: null,
    parentTitle: null,
    note: null,
    markedVia: "discord",
    markedAt: new Date("2026-07-01T12:00:00Z"),
    radarrTitleSlug: null,
    sonarrTitleSlug: "the-office",
    user: { id: "u1", name: "Alice", email: "a@x.com", image: null },
    ...overrides,
  }
}

beforeEach(() => {
  jest.clearAllMocks()
  mockRequireAdmin.mockResolvedValue(undefined)
  findMany.mockResolvedValue([])
  count.mockResolvedValue(0)
  groupBy.mockResolvedValue([])
})

describe("getDiscordMarkedMedia", () => {
  it("requires admin access", async () => {
    await getDiscordMarkedMedia()
    expect(mockRequireAdmin).toHaveBeenCalled()
  })

  it("returns a per-type summary covering all mark types (zero-filled)", async () => {
    groupBy.mockResolvedValue([
      { markType: "KEEP_FOREVER", _count: { _all: 3 } },
      { markType: "POOR_QUALITY", _count: { _all: 1 } },
    ])

    const result = await getDiscordMarkedMedia()

    expect(result.success).toBe(true)
    // All 6 mark types present, missing ones zero-filled.
    expect(result.summary).toHaveLength(6)
    const byType = Object.fromEntries(result.summary.map((s) => [s.markType, s.count]))
    expect(byType.KEEP_FOREVER).toBe(3)
    expect(byType.POOR_QUALITY).toBe(1)
    expect(byType.FINISHED_WATCHING).toBe(0)
  })

  it("serializes marks with user info and ISO timestamps", async () => {
    findMany.mockResolvedValue([makeRow()])
    count.mockResolvedValue(1)

    const result = await getDiscordMarkedMedia()

    expect(result.marks).toHaveLength(1)
    expect(result.marks[0]).toMatchObject({
      title: "The Office",
      markType: "KEEP_FOREVER",
      markedVia: "discord",
      markedAt: "2026-07-01T12:00:00.000Z",
      user: { name: "Alice", email: "a@x.com" },
    })
    expect(result.total).toBe(1)
  })

  it("filters the list by mark type but keeps the summary scoped to date/source only", async () => {
    await getDiscordMarkedMedia({ markType: "POOR_QUALITY" as never })

    // List query includes markType…
    expect(findMany.mock.calls[0][0].where.markType).toBe("POOR_QUALITY")
    // …but the summary groupBy where does NOT (so counts stay comparable).
    expect(groupBy.mock.calls[0][0].where.markType).toBeUndefined()
  })

  it("applies a case-insensitive title search to the list", async () => {
    await getDiscordMarkedMedia({ search: "office" })
    expect(findMany.mock.calls[0][0].where.title).toEqual({
      contains: "office",
      mode: "insensitive",
    })
  })

  it("maps source=discord to markedVia and source=web through verbatim", async () => {
    await getDiscordMarkedMedia({ source: "discord" })
    expect(findMany.mock.calls[0][0].where.markedVia).toBe("discord")

    jest.clearAllMocks()
    findMany.mockResolvedValue([])
    count.mockResolvedValue(0)
    groupBy.mockResolvedValue([])
    await getDiscordMarkedMedia({ source: "web" })
    expect(findMany.mock.calls[0][0].where.markedVia).toBe("web")
  })

  it("does not filter by source when source is 'all'", async () => {
    await getDiscordMarkedMedia({ source: "all" })
    expect(findMany.mock.calls[0][0].where.markedVia).toBeUndefined()
  })

  it("applies date range to markedAt", async () => {
    await getDiscordMarkedMedia({ startDate: "2026-07-01", endDate: "2026-07-31" })
    const where = findMany.mock.calls[0][0].where
    expect(where.markedAt.gte).toBeInstanceOf(Date)
    expect(where.markedAt.lt).toBeInstanceOf(Date)
  })

  it("passes take/skip for pagination", async () => {
    await getDiscordMarkedMedia({ limit: 10, offset: 20 })
    expect(findMany.mock.calls[0][0].take).toBe(10)
    expect(findMany.mock.calls[0][0].skip).toBe(20)
  })

  it("returns a safe error shape when the query throws", async () => {
    findMany.mockRejectedValue(new Error("db down"))
    const result = await getDiscordMarkedMedia()
    expect(result.success).toBe(false)
    expect(result.marks).toEqual([])
    expect(result.total).toBe(0)
    expect(result.summary).toEqual([])
  })
})
