/**
 * @jest-environment node
 */

/**
 * The roster clean-up CLI's arguments, output and migration preflight (P0.20),
 * against a mocked client. The Postgres-backed run is
 * rewind-strip-leaderboards.pg.test.ts beside this file.
 */

import type { PrismaClient } from "@/lib/generated/prisma/client"
import { formatStripCounts, formatStripHeader, main, parseStripArgs } from "@/scripts/rewind-strip-leaderboards"

const NOW = new Date("2026-10-23T09:00:00Z")
const RELEASE = "2026-10-22T18:00:00Z"
const DATABASE_URL = "postgresql://plex:s3cret@db.internal:5432/plex_manager"

describe("parseStripArgs", () => {
  it("is a dry run without --apply, with or without a cutoff", () => {
    expect(parseStripArgs([], NOW)).toEqual({ ok: true, options: { apply: false, optInSince: null } })
    expect(parseStripArgs([`--opt-in-since=${RELEASE}`], NOW)).toEqual({
      ok: true,
      options: { apply: false, optInSince: new Date(RELEASE) },
    })
  })

  it("applies only with --apply and a cutoff, in either order", () => {
    const expected = { ok: true, options: { apply: true, optInSince: new Date(RELEASE) } }

    expect(parseStripArgs(["--apply", `--opt-in-since=${RELEASE}`], NOW)).toEqual(expected)
    expect(parseStripArgs([`--opt-in-since=${RELEASE}`, "--apply"], NOW)).toEqual(expected)
    expect(parseStripArgs(["--apply", "--opt-in-since=2026-10-22T20:00:00+02:00"], NOW)).toEqual(expected)
  })

  it("refuses --apply without a cutoff", () => {
    expect(parseStripArgs(["--apply"], NOW)).toEqual({ ok: false, help: false, error: "--apply needs --opt-in-since." })
  })

  it("refuses a cutoff without a timezone, an unparsable one and one in the future", () => {
    const invalid = { ok: false, help: false, error: "--opt-in-since must be an ISO time with Z or an offset." }

    expect(parseStripArgs(["--opt-in-since=2026-10-22T18:00:00"], NOW)).toEqual(invalid)
    expect(parseStripArgs(["--opt-in-since=2026-10-22"], NOW)).toEqual(invalid)
    expect(parseStripArgs(["--opt-in-since=yesterday"], NOW)).toEqual(invalid)
    expect(parseStripArgs(["--apply", "--opt-in-since=2026-10-23T09:00:01Z"], NOW)).toEqual({
      ok: false,
      help: false,
      error: "--opt-in-since is in the future.",
    })
  })

  it("refuses unknown and repeated arguments, and recognises --help", () => {
    expect(parseStripArgs(["--aply"], NOW)).toMatchObject({ ok: false, help: false, error: "Unknown or repeated argument: --aply" })
    expect(parseStripArgs(["--apply", "--apply", `--opt-in-since=${RELEASE}`], NOW)).toMatchObject({ ok: false, help: false })
    expect(parseStripArgs(["--opt-in-since", RELEASE], NOW)).toMatchObject({ ok: false, help: false })
    expect(parseStripArgs(["--apply", "--help"], NOW)).toEqual({ ok: false, help: true })
    expect(parseStripArgs(["-h"], NOW)).toEqual({ ok: false, help: true })
  })
})

describe("formatStripHeader", () => {
  it("names the masked target database and the cutoff", () => {
    expect(formatStripHeader({ apply: true, optInSince: new Date(RELEASE) }, DATABASE_URL)).toEqual([
      "Rewind roster clean-up: applying to postgresql://plex:***@db.internal:5432/plex_manager.",
      "Opt-in since 2026-10-22T18:00:00.000Z: share links on Rewinds written since then are kept.",
    ])
  })

  it("says a dry run writes nothing, and what step 4 counts without a cutoff", () => {
    const lines = formatStripHeader({ apply: false, optInSince: null }, DATABASE_URL)

    expect(lines).toEqual([
      "Rewind roster clean-up: dry run against postgresql://plex:***@db.internal:5432/plex_manager, nothing is written (pass --apply to write).",
      "Opt-in since: not set, so step 4 counts every unvisited token (--apply needs --opt-in-since).",
    ])
    expect(lines.join("\n")).not.toContain("s3cret")
  })
})

describe("formatStripCounts", () => {
  const report = {
    apply: false,
    storedData: { scanned: 12, changed: 3, unparsable: 1, skipped: 0 },
    llmText: { scanned: 40, changed: 38 },
    errors: { scanned: 2, changed: 1 },
    tokens: { scanned: 9, changed: 7 },
    visits: { scanned: 30, changed: 30 },
  }

  it("prints scanned and changed counts for each step", () => {
    expect(formatStripCounts(report)).toEqual([
      "1. Stored data     scanned 12, changed 3, unparsable 1",
      "2. LLM text        scanned 40, changed 38",
      "3. Errors          scanned 2, changed 1",
      "4. Share tokens    scanned 9, changed 7",
      "5. Legacy visits   scanned 30, changed 30",
    ])
  })

  it("adds the skipped count when applied", () => {
    expect(formatStripCounts({ ...report, apply: true })[0]).toBe(
      "1. Stored data     scanned 12, changed 3, unparsable 1, skipped 0"
    )
  })
})

describe("main", () => {
  /** A client whose LLMUsage columns are nullable or not; any other call fails the test. */
  function mockDb(nullable: boolean) {
    const unexpected = () => {
      throw new Error("the clean-up ran")
    }
    const unexpectedCall = () => jest.fn<Promise<unknown>, unknown[]>(unexpected)
    const isNullable = nullable ? "YES" : "NO"
    return {
      $queryRaw: jest.fn().mockResolvedValue([
        { column_name: "prompt", is_nullable: isNullable },
        { column_name: "response", is_nullable: isNullable },
      ]),
      plexWrapped: { count: unexpectedCall(), findMany: unexpectedCall(), updateMany: unexpectedCall() },
      wrappedShareVisit: { count: unexpectedCall() },
      $transaction: jest.fn(unexpected),
    }
  }

  async function run(argv: string[], db: ReturnType<typeof mockDb>) {
    const lines: string[] = []
    const code = await main(argv, {
      db: db as unknown as PrismaClient,
      databaseUrl: DATABASE_URL,
      print: (line) => lines.push(line),
      now: NOW,
    })
    return { code, lines }
  }

  it("refuses to apply, before any read or write, while the LLMUsage text columns are NOT NULL", async () => {
    const db = mockDb(false)

    const { code, lines } = await run(["--apply", `--opt-in-since=${RELEASE}`], db)

    expect(code).toBe(1)
    expect(lines).toEqual([
      "Rewind roster clean-up: applying to postgresql://plex:***@db.internal:5432/plex_manager.",
      "Opt-in since 2026-10-22T18:00:00.000Z: share links on Rewinds written since then are kept.",
      "Refusing to apply. LLMUsage.prompt and response are still NOT NULL: deploy migration 20261021000000_llmusage_text_nullable first.",
    ])
    expect(db.$queryRaw).toHaveBeenCalledTimes(1)
    expect(db.plexWrapped.count).not.toHaveBeenCalled()
    expect(db.$transaction).not.toHaveBeenCalled()
  })

  it("warns in a dry run that --apply will refuse, then counts", async () => {
    const db = mockDb(false)
    db.plexWrapped.count.mockImplementation(() => Promise.resolve(0))
    db.plexWrapped.findMany.mockImplementation(() => Promise.resolve([]))
    db.wrappedShareVisit.count.mockImplementation(() => Promise.resolve(0))
    const dbWithUsage = Object.assign(db, { lLMUsage: { count: jest.fn().mockResolvedValue(0) } })

    const { code, lines } = await run([], dbWithUsage)

    expect(code).toBe(0)
    expect(lines[2]).toBe(
      "Warning: LLMUsage.prompt and response are still NOT NULL: deploy migration 20261021000000_llmusage_text_nullable first. --apply will refuse until then."
    )
    expect(lines.slice(3)).toHaveLength(5)
  })

  it("prints the error and the usage for bad arguments, and only the usage for --help", async () => {
    const db = mockDb(true)

    expect(await run(["--apply"], db)).toEqual({
      code: 2,
      lines: [
        "--apply needs --opt-in-since.",
        "Usage: npm run rewind:strip-leaderboards -- [--apply] --opt-in-since=<ISO time the P0.19 release went live>",
      ],
    })
    expect((await run(["--help"], db)).code).toBe(0)
    expect(db.$queryRaw).not.toHaveBeenCalled()
  })
})
