/**
 * @jest-environment node
 */

/**
 * The pure transforms of the October 2026 roster clean-up (P0.20), and the
 * runner's write discipline against a mocked client. The Postgres-backed run
 * is scripts/__tests__/rewind-strip-leaderboards.pg.test.ts.
 */

import type { PrismaClient } from "@/lib/generated/prisma/client"
import { buildLeaderboards, buildStatistics, LEADERBOARD_MEMBER_EMAIL } from "@/lib/wrapped/__tests__/fixtures"
import {
  formatStripReport,
  parseStripArgs,
  scrubOwnerEmail,
  stripLegacyError,
  stripRosters,
  stripStoredRewind,
} from "@/lib/wrapped/maintenance/strip-rosters"

const OWNER = { name: "Mike", email: "Mike.Owner@example.com" }

function storedRewind(overrides: Record<string, unknown> = {}) {
  return {
    version: 2,
    year: 2025,
    userId: "user-1",
    userName: "Mike",
    generatedAt: "2025-12-01T00:00:00.000Z",
    statistics: { ...buildStatistics(), leaderboards: buildLeaderboards() },
    sections: [{ id: "hero", type: "hero", title: "Your year", content: "What a year, Mike." }],
    summary: "Mike watched 85 films.",
    ...overrides,
  }
}

function strip(data: unknown, owner = OWNER) {
  const result = stripStoredRewind(JSON.stringify(data), owner)
  if (result.status !== "changed") throw new Error(`expected a change, got ${result.status}`)
  return JSON.parse(result.data)
}

describe("stripStoredRewind", () => {
  it("deletes statistics.leaderboards from a v2 row and keeps every other key", () => {
    const row = storedRewind()
    const stripped = strip(row)

    expect(stripped.statistics).not.toHaveProperty("leaderboards")
    const { leaderboards: _removed, ...rest } = row.statistics
    expect(stripped.statistics).toEqual(JSON.parse(JSON.stringify(rest)))
    expect(stripped.statistics.percentile).toEqual({ percentile: 5, topPercentLabel: "Top 5%" })
    expect(JSON.stringify(stripped)).not.toContain(LEADERBOARD_MEMBER_EMAIL)
    expect(JSON.stringify(stripped)).not.toContain("Alice Smith")
  })

  it("deletes leaderboards from a v1 row, which has no version or derived statistics", () => {
    const { derived: _derived, percentile: _percentile, ...v1Statistics } = buildStatistics()
    const row = storedRewind({ version: undefined, statistics: { ...v1Statistics, leaderboards: buildLeaderboards() } })

    expect(strip(row).statistics).toEqual(JSON.parse(JSON.stringify(v1Statistics)))
  })

  it("replaces a userName containing @ with the member's name", () => {
    expect(strip(storedRewind({ userName: "mike.owner@example.com" })).userName).toBe("Mike")
    expect(strip(storedRewind({ userName: "someone@else.example" })).userName).toBe("Mike")
  })

  it("falls back to Viewer when the member's name is empty or itself an email", () => {
    const row = storedRewind({ userName: "mike.owner@example.com" })

    expect(strip(row, { name: "mike.owner@example.com", email: OWNER.email }).userName).toBe("Viewer")
    expect(strip(row, { name: "  ", email: OWNER.email }).userName).toBe("Viewer")
    expect(strip(row, { name: null, email: null }).userName).toBe("Viewer")
  })

  it("replaces the owner's email, in any case, in every nested string value but not in keys", () => {
    const row = storedRewind({
      statistics: buildStatistics(),
      sections: [{ id: "hero", content: "Hi MIKE.OWNER@EXAMPLE.COM, and mike.owner@example.com again" }],
      insights: { funFacts: ["mike.owner@example.com watched at 3 AM", "No email here"] },
      summary: "A year for Mike.Owner@example.com",
      "mike.owner@example.com": "a key is not a value",
    })

    const stripped = strip(row)

    expect(stripped.sections[0].content).toBe("Hi Mike, and Mike again")
    expect(stripped.insights.funFacts).toEqual(["Mike watched at 3 AM", "No email here"])
    expect(stripped.summary).toBe("A year for Mike")
    expect(stripped["mike.owner@example.com"]).toBe("a key is not a value")
  })

  it("escapes the email and does not read replacement patterns in the name", () => {
    const owner = { name: "Mo $& $1", email: "a+b@x.io" }
    const row = storedRewind({ statistics: buildStatistics(), summary: "Hi a+b@x.io, not aab@x.io or a+b@xxio" })

    expect(strip(row, owner).summary).toBe("Hi Mo $& $1, not aab@x.io or a+b@xxio")
  })

  it("leaves a clean row unchanged, and a stripped row is clean, so a second pass is a no-op", () => {
    const row = storedRewind({ userName: "mike.owner@example.com", summary: "mike.owner@example.com's year" })
    const once = stripStoredRewind(JSON.stringify(row), OWNER)
    if (once.status !== "changed") throw new Error("expected a change")

    expect(stripStoredRewind(once.data, OWNER)).toEqual({ status: "unchanged" })
    expect(stripStoredRewind(JSON.stringify(storedRewind({ statistics: buildStatistics() })), OWNER)).toEqual({
      status: "unchanged",
    })
  })

  it("reports JSON that is not an object as unparsable", () => {
    expect(stripStoredRewind("not json", OWNER)).toEqual({ status: "unparsable" })
    expect(stripStoredRewind("null", OWNER)).toEqual({ status: "unparsable" })
    expect(stripStoredRewind("[1,2]", OWNER)).toEqual({ status: "unparsable" })
  })
})

describe("scrubOwnerEmail", () => {
  it("replaces the owner's email in the summary column", () => {
    expect(scrubOwnerEmail("mike.owner@example.com watched 85 films", OWNER)).toBe("Mike watched 85 films")
  })

  it("returns null, text without the email, and text for an owner with no email unchanged", () => {
    expect(scrubOwnerEmail(null, OWNER)).toBeNull()
    expect(scrubOwnerEmail("Mike watched 85 films", OWNER)).toBe("Mike watched 85 films")
    expect(scrubOwnerEmail("x@y.example watched", { name: "Mike", email: null })).toBe("x@y.example watched")
  })
})

describe("stripLegacyError", () => {
  it("replaces the roster error with the TAUTULLI_USER_NOT_FOUND code", () => {
    const legacy =
      "User not found in Tautulli. Plex User ID: 1, Email: mike@example.com. Available users: jsnow (jsnow@example.com)"

    expect(stripLegacyError(legacy)).toBe('{"code":"TAUTULLI_USER_NOT_FOUND"}')
  })

  it("leaves other errors, stored codes and null unchanged", () => {
    expect(stripLegacyError("LLM provider timed out")).toBe("LLM provider timed out")
    expect(stripLegacyError('{"code":"TAUTULLI_USER_NOT_FOUND"}')).toBe('{"code":"TAUTULLI_USER_NOT_FOUND"}')
    expect(stripLegacyError(null)).toBeNull()
  })
})

describe("parseStripArgs", () => {
  it("is a dry run without arguments and applies only with --apply", () => {
    expect(parseStripArgs([])).toEqual({ ok: true, apply: false })
    expect(parseStripArgs(["--apply"])).toEqual({ ok: true, apply: true })
  })

  it("refuses anything else, and recognises --help", () => {
    expect(parseStripArgs(["--aply"])).toEqual({ ok: false, help: false })
    expect(parseStripArgs(["--apply", "--force"])).toEqual({ ok: false, help: false })
    expect(parseStripArgs(["--help"])).toEqual({ ok: false, help: true })
  })
})

describe("formatStripReport", () => {
  const report = {
    apply: false,
    storedData: { scanned: 12, changed: 3, unparsable: 1, skipped: 0 },
    llmText: { scanned: 40, changed: 38 },
    errors: { scanned: 2, changed: 1 },
    tokens: { scanned: 9, changed: 7 },
    visits: { scanned: 30, changed: 30 },
  }

  it("prints a header and scanned and changed counts for each step", () => {
    expect(formatStripReport(report)).toEqual([
      "Rewind roster clean-up: dry run, nothing written (pass --apply to write).",
      "1. Stored data     scanned 12, changed 3, unparsable 1",
      "2. LLM text        scanned 40, changed 38",
      "3. Errors          scanned 2, changed 1",
      "4. Share tokens    scanned 9, changed 7",
      "5. Legacy visits   scanned 30, changed 30",
    ])
  })

  it("adds the skipped count when applied", () => {
    const lines = formatStripReport({ ...report, apply: true })

    expect(lines[0]).toBe("Rewind roster clean-up: applied.")
    expect(lines[1]).toBe("1. Stored data     scanned 12, changed 3, unparsable 1, skipped 0")
  })
})

describe("stripRosters against a mocked client", () => {
  type Row = { id: string; data: string; summary: string | null; updatedAt: Date; user: { name: string | null; email: string | null } }

  function rowFor(id: string, data: unknown, summary: string | null = null): Row {
    return { id, data: JSON.stringify(data), summary, updatedAt: new Date("2025-12-01T00:00:00Z"), user: OWNER }
  }

  function mockDb(rows: Row[], legacyVisits: number) {
    const tx = {
      wrappedShareVisit: {
        count: jest.fn().mockResolvedValue(legacyVisits),
        deleteMany: jest.fn().mockResolvedValue({ count: legacyVisits }),
      },
      plexWrapped: {
        count: jest.fn().mockResolvedValue(4),
        updateMany: jest.fn().mockResolvedValue({ count: 4 }),
      },
    }
    const db = {
      plexWrapped: {
        findMany: jest.fn(({ where, take }: { where: { id?: { gt: string } }; take: number }) => {
          const after = where.id?.gt
          return Promise.resolve(rows.filter((row) => after === undefined || row.id > after).slice(0, take))
        }),
        // 4 unvisited tokens; 5 for every other count
        count: jest.fn(({ where }: { where: { shareVisits?: unknown } }) => Promise.resolve(where.shareVisits ? 4 : 5)),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      lLMUsage: {
        count: jest.fn().mockResolvedValue(6),
        updateMany: jest.fn().mockResolvedValue({ count: 6 }),
      },
      wrappedShareVisit: { count: jest.fn().mockResolvedValue(legacyVisits) },
      $transaction: jest.fn((fn: (client: typeof tx) => Promise<unknown>) => fn(tx)),
    }
    return { db, tx, client: db as unknown as PrismaClient }
  }

  /** 201 rows: one more than a batch, so the cursor is followed. Every 50th holds a roster. */
  const rows = Array.from({ length: 201 }, (_, index) => {
    const id = `w${String(index).padStart(4, "0")}`
    return index % 50 === 0 ? rowFor(id, storedRewind()) : rowFor(id, { statistics: buildStatistics() })
  })

  it("writes nothing in a dry run and counts what an apply would change", async () => {
    const { db, tx, client } = mockDb(rows, 3)

    const report = await stripRosters(client, { apply: false })

    expect(report.storedData).toEqual({ scanned: 201, changed: 5, unparsable: 0, skipped: 0 })
    expect(report.tokens.changed).toBe(4)
    expect(report.visits.changed).toBe(3)
    expect(db.plexWrapped.updateMany).not.toHaveBeenCalled()
    expect(db.lLMUsage.updateMany).not.toHaveBeenCalled()
    expect(db.$transaction).not.toHaveBeenCalled()
    expect(tx.plexWrapped.updateMany).not.toHaveBeenCalled()
  })

  it("reads stored rows in id-cursor batches of 200", async () => {
    const { db, client } = mockDb(rows, 0)

    await stripRosters(client, { apply: false })

    expect(db.plexWrapped.findMany).toHaveBeenCalledTimes(2)
    expect(db.plexWrapped.findMany.mock.calls[0][0]).toMatchObject({ where: {}, orderBy: { id: "asc" }, take: 200 })
    expect(db.plexWrapped.findMany.mock.calls[1][0]).toMatchObject({ where: { id: { gt: "w0199" } }, take: 200 })
  })

  it("writes only changed rows, guarded by updatedAt, and counts a row written meanwhile as skipped", async () => {
    const { db, client } = mockDb(rows, 0)
    db.plexWrapped.updateMany.mockResolvedValueOnce({ count: 0 })

    const report = await stripRosters(client, { apply: true })

    const rowWrites = db.plexWrapped.updateMany.mock.calls
      .map(([args]) => args)
      .filter((args: { where: { id?: string } }) => args.where.id !== undefined)
    expect(rowWrites.map((args: { where: { id: string } }) => args.where.id)).toEqual(["w0000", "w0050", "w0100", "w0150", "w0200"])
    expect(rowWrites[0]).toEqual({
      where: { id: "w0000", updatedAt: new Date("2025-12-01T00:00:00Z") },
      data: { data: expect.not.stringContaining("leaderboards") },
    })
    expect(report.storedData).toEqual({ scanned: 201, changed: 5, unparsable: 0, skipped: 1 })
  })

  it("revokes tokens and deletes visits in one transaction, and only while legacy visits exist", async () => {
    const withLegacy = mockDb([], 3)
    await stripRosters(withLegacy.client, { apply: true })

    expect(withLegacy.db.$transaction).toHaveBeenCalledTimes(1)
    expect(withLegacy.tx.plexWrapped.updateMany).toHaveBeenCalledWith({
      where: { shareToken: { not: null }, shareVisits: { none: {} } },
      data: { shareToken: null },
    })
    expect(withLegacy.tx.wrappedShareVisit.deleteMany).toHaveBeenCalledTimes(1)
    expect(withLegacy.tx.plexWrapped.updateMany.mock.invocationCallOrder[0]).toBeLessThan(
      withLegacy.tx.wrappedShareVisit.deleteMany.mock.invocationCallOrder[0]
    )

    const withoutLegacy = mockDb([], 0)
    const report = await stripRosters(withoutLegacy.client, { apply: true })

    expect(withoutLegacy.tx.plexWrapped.updateMany).not.toHaveBeenCalled()
    expect(withoutLegacy.tx.wrappedShareVisit.deleteMany).not.toHaveBeenCalled()
    expect(report.tokens.changed).toBe(0)
    expect(report.visits.changed).toBe(0)
  })

  it("nulls LLM text only on rows without a chat conversation", async () => {
    const { db, client } = mockDb([], 0)

    await stripRosters(client, { apply: true })

    expect(db.lLMUsage.updateMany).toHaveBeenCalledWith({
      where: { chatConversationId: null, OR: [{ prompt: { not: null } }, { response: { not: null } }] },
      data: { prompt: null, response: null },
    })
  })
})
