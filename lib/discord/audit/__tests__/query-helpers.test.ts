import {
  dateRangeWhere,
  toDateKey,
  foldStatusCounts,
  type StatusCountGroup,
} from "../query-helpers"
import type { DiscordCommandStatus } from "@/lib/generated/prisma/client"

describe("dateRangeWhere", () => {
  it("builds a gte/lt createdAt clause", () => {
    const start = new Date("2024-01-01T00:00:00.000Z")
    const end = new Date("2024-01-16T00:00:00.000Z")

    expect(dateRangeWhere(start, end)).toEqual({
      createdAt: {
        gte: start,
        lt: end,
      },
    })
  })
})

describe("toDateKey", () => {
  it("buckets a timestamp into its YYYY-MM-DD key in the zone", () => {
    expect(toDateKey(new Date("2024-01-15T10:30:00Z"), "UTC")).toBe("2024-01-15")
    expect(toDateKey(new Date("2024-01-01T23:59:59.000Z"), "UTC")).toBe("2024-01-01")
  })

  it("puts an evening in Los Angeles on that day, not the UTC one", () => {
    expect(toDateKey(new Date("2024-01-02T03:00:00Z"), "America/Los_Angeles")).toBe("2024-01-01")
  })
})

describe("foldStatusCounts", () => {
  const group = (
    status: DiscordCommandStatus,
    count: number
  ): StatusCountGroup => ({
    status,
    _count: { _all: count },
  })

  it("folds a groupBy(['status']) result into per-status counts", () => {
    expect(
      foldStatusCounts([
        group("SUCCESS" as DiscordCommandStatus, 95),
        group("FAILED" as DiscordCommandStatus, 5),
        group("TIMEOUT" as DiscordCommandStatus, 2),
        group("PENDING" as DiscordCommandStatus, 3),
      ])
    ).toEqual({
      success: 95,
      failed: 5,
      timeout: 2,
      pending: 3,
    })
  })

  it("returns zeroed counts for an empty result", () => {
    expect(foldStatusCounts([])).toEqual({
      success: 0,
      failed: 0,
      timeout: 0,
      pending: 0,
    })
  })

  it("sums multiple groups with the same status", () => {
    expect(
      foldStatusCounts([
        group("SUCCESS" as DiscordCommandStatus, 10),
        group("SUCCESS" as DiscordCommandStatus, 5),
      ])
    ).toEqual({
      success: 15,
      failed: 0,
      timeout: 0,
      pending: 0,
    })
  })
})
