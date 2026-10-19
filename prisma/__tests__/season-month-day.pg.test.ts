/**
 * @jest-environment node
 */

/**
 * The `rewind_season_month_day` data migration against a real PostgreSQL
 * database (P2.2, GAP-40).
 *
 * The legacy form saved the admin's browser-local midnight, so a window of
 * 1 December to 31 January saved from Berlin, Los Angeles or Sydney is three
 * different UTC instants. The migration must turn each into `12-01` and
 * `01-31`, and give the same result whatever the session's TimeZone.
 *
 * Each run happens inside a transaction that is rolled back, so the shared
 * test database keeps its Config rows. Gated by `describePg`; run with
 * `npm run test:integration`.
 */

import { readFileSync } from "node:fs"
import path from "node:path"

import { PrismaPg } from "@prisma/adapter-pg"

import { PrismaClient } from "@/lib/generated/prisma/client"
import { describePg } from "@/test/helpers/integration"

const MIGRATION = path.join(__dirname, "..", "migrations", "20261027000000_rewind_season_month_day", "migration.sql")

/** The migration's statements, without comments (one statement per `$executeRawUnsafe`). */
function statements(): string[] {
  return readFileSync(MIGRATION, "utf8")
    .split("\n")
    .filter((line) => !line.trimStart().startsWith("--"))
    .join("\n")
    .split(";")
    .map((statement) => statement.trim())
    .filter(Boolean)
}

/** Browser-local midnight on 1 December 2026 and 31 January 2027, as the old form stored it. */
const SAVED_FROM = {
  "p22-berlin": ["2026-11-30T23:00:00Z", "2027-01-30T23:00:00Z"],
  "p22-los-angeles": ["2026-12-01T08:00:00Z", "2027-01-31T08:00:00Z"],
  "p22-sydney": ["2026-11-30T13:00:00Z", "2027-01-30T13:00:00Z"],
} as const

class Rollback extends Error {}

describePg("rewind_season_month_day migration", (databaseUrl) => {
  let db: PrismaClient

  beforeAll(() => {
    db = new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl }) })
  })

  afterAll(async () => {
    await db.$disconnect()
  })

  /** Seeds the rows, runs the migration (twice, to show it is idempotent), reads them, rolls back. */
  async function migrateUnder(sessionZone: string | null) {
    let result: Record<string, [string, string]> = {}
    await db
      .$transaction(async (tx) => {
        if (sessionZone) await tx.$executeRawUnsafe(`SET TIME ZONE '${sessionZone}'`)
        await tx.config.createMany({
          data: Object.entries(SAVED_FROM).map(([id, [opens, closes]]) => ({
            id,
            wrappedGenerationStartDate: new Date(opens),
            wrappedGenerationEndDate: new Date(closes),
          })),
        })
        // No legacy window: the month-day values are left as they are
        await tx.config.create({ data: { id: "p22-no-window", rewindSeasonOpens: "11-20", rewindSeasonCloses: "01-15" } })
        for (let run = 0; run < 2; run++) {
          for (const statement of statements()) await tx.$executeRawUnsafe(statement)
        }
        const rows = await tx.config.findMany({
          where: { id: { startsWith: "p22-" } },
          select: { id: true, rewindSeasonOpens: true, rewindSeasonCloses: true },
          orderBy: { id: "asc" },
        })
        result = Object.fromEntries(rows.map((row) => [row.id, [row.rewindSeasonOpens, row.rewindSeasonCloses]]))
        throw new Rollback()
      })
      .catch((error: unknown) => {
        if (!(error instanceof Rollback)) throw error
      })
    return result
  }

  it("recovers 12-01 and 01-31 from dates saved in Berlin, Los Angeles and Sydney", async () => {
    await expect(migrateUnder(null)).resolves.toEqual({
      "p22-berlin": ["12-01", "01-31"],
      "p22-los-angeles": ["12-01", "01-31"],
      "p22-no-window": ["11-20", "01-15"],
      "p22-sydney": ["12-01", "01-31"],
    })
  })

  it("gives the same result under a Los Angeles session", async () => {
    const underDefault = await migrateUnder(null)
    await expect(migrateUnder("America/Los_Angeles")).resolves.toEqual(underDefault)
  })

  it("leaves the shared Config rows untouched", async () => {
    await migrateUnder(null)
    await expect(db.config.count({ where: { id: { startsWith: "p22-" } } })).resolves.toBe(0)
  })
})
