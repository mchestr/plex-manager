/**
 * @jest-environment node
 */

/**
 * The `drop_prometheus_status` migration against a real PostgreSQL database:
 * an install whose setup stopped on the removed Prometheus step resumes on the
 * summary, every other position stays, and the table is gone.
 *
 * The test database is already migrated, so the test puts the `Prometheus`
 * table back, runs the whole migration, and rolls the transaction back. Gated
 * by `describePg`; run with `npm run test:integration`.
 */

import { readFileSync } from "node:fs"
import path from "node:path"

import { PrismaPg } from "@prisma/adapter-pg"

import { PrismaClient } from "@/lib/generated/prisma/client"
import { describePg } from "@/__tests__/helpers/integration"

const MIGRATION = path.join(__dirname, "..", "migrations", "20270119000006_drop_prometheus_status", "migration.sql")

/** The migration's statements, comments removed. */
function statements(): string[] {
  return readFileSync(MIGRATION, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .filter((line) => !line.trimStart().startsWith("--"))
    .join("\n")
    .split(";")
    .map((statement) => statement.trim())
    .filter(Boolean)
}

class Rollback extends Error {}

describePg("drop_prometheus_status migration", (databaseUrl) => {
  let db: PrismaClient

  beforeAll(() => {
    db = new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl }) })
  })

  afterAll(async () => {
    await db.$disconnect()
  })

  it("moves a wizard stopped on the prometheus step to the summary and drops the table", async () => {
    let positions: string[] = []
    let tableAfter: unknown[] = []

    await db
      .$transaction(async (tx) => {
        await tx.$executeRawUnsafe(
          `CREATE TABLE "Prometheus" (id TEXT PRIMARY KEY, name TEXT NOT NULL, url TEXT NOT NULL, query TEXT NOT NULL)`
        )
        for (const step of ["plex", "discord", "prometheus"]) {
          await tx.$executeRawUnsafe(
            `INSERT INTO "Setup" (id, "isComplete", "currentStepId", "createdAt", "updatedAt") VALUES ($1, false, $2, now(), now())`,
            `dp-${step}`,
            step
          )
        }

        for (const statement of statements()) await tx.$executeRawUnsafe(statement)

        const rows = await tx.setup.findMany({ where: { id: { startsWith: "dp-" } }, select: { currentStepId: true }, orderBy: { id: "asc" } })
        positions = rows.map((row) => row.currentStepId)
        tableAfter = await tx.$queryRawUnsafe(`SELECT to_regclass('"Prometheus"')::text AS found`)
        throw new Rollback()
      })
      .catch((error: unknown) => {
        if (!(error instanceof Rollback)) throw error
      })

    expect(positions).toEqual(["discord", "plex", "summary"])
    expect(tableAfter).toEqual([{ found: null }])
  })
})
