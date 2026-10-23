/**
 * @jest-environment node
 */

/**
 * The `p1024_setup_step_ids` migration against a real PostgreSQL database
 * (P10.24): every stored wizard number maps to its step id by the old order,
 * 10 resumes on Prometheus, and no service row's `isActive` changes.
 *
 * The test database is already migrated, so the test puts the old
 * `currentStep` column back, runs the whole migration, and rolls the
 * transaction back. Gated by `describePg`; run with `npm run test:integration`.
 */

import { readFileSync } from "node:fs"
import path from "node:path"

import { PrismaPg } from "@prisma/adapter-pg"

import { PrismaClient } from "@/lib/generated/prisma/client"
import { describePg } from "@/test/helpers/integration"

const MIGRATION = path.join(__dirname, "..", "migrations", "20270117000010_p1024_setup_step_ids", "migration.sql")

/** The migration's statements, comments removed. */
function statements(): string[] {
  return readFileSync(MIGRATION, "utf8")
    .split("\n")
    .filter((line) => !line.trimStart().startsWith("--"))
    .join("\n")
    .split(";")
    .map((statement) => statement.trim())
    .filter(Boolean)
}

class Rollback extends Error {}

const SERVICE_TABLES = ["PlexServer", "JellyfinServer", "Tautulli", "Overseerr", "Sonarr", "Radarr", "Prometheus"]

describePg("setup_step_ids migration", (databaseUrl) => {
  let db: PrismaClient

  beforeAll(() => {
    db = new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl }) })
  })

  afterAll(async () => {
    await db.$disconnect()
  })

  it("maps 1 to 10 by the old order and leaves every service row's isActive alone", async () => {
    let mapped: { id: string; currentStepId: string }[] = []
    let servicesBefore: unknown[] = []
    let servicesAfter: unknown[] = []

    const services = async (tx: Pick<PrismaClient, "$queryRawUnsafe">) => {
      const all: unknown[] = []
      for (const table of SERVICE_TABLES) {
        all.push(await tx.$queryRawUnsafe(`SELECT id, "isActive" FROM "${table}" ORDER BY id`))
      }
      return all
    }

    await db
      .$transaction(async (tx) => {
        // Two active Tautulli rows: the duplicate P11.31 cleans up, never this migration
        await tx.tautulli.createMany({
          data: [
            { id: "p1024-t1", name: "A", url: "http://a.lan:8181", apiKey: "k", isActive: true },
            { id: "p1024-t2", name: "B", url: "http://b.lan:8181", apiKey: "k", isActive: true },
            { id: "p1024-t3", name: "C", url: "http://c.lan:8181", apiKey: "k", isActive: false },
          ],
        })
        servicesBefore = await services(tx)

        // Back to the schema before the migration, with one wizard row per stored number
        await tx.$executeRawUnsafe(`ALTER TABLE "Setup" DROP COLUMN "currentStepId"`)
        await tx.$executeRawUnsafe(`ALTER TABLE "Setup" ADD COLUMN "currentStep" INTEGER NOT NULL DEFAULT 1`)
        for (let step = 1; step <= 10; step++) {
          await tx.$executeRawUnsafe(
            `INSERT INTO "Setup" (id, "isComplete", "currentStep", "createdAt", "updatedAt") VALUES ($1, false, $2, now(), now())`,
            `p1024-step-${String(step).padStart(2, "0")}`,
            step
          )
        }

        for (const statement of statements()) await tx.$executeRawUnsafe(statement)

        mapped = await tx.setup.findMany({
          where: { id: { startsWith: "p1024-step-" } },
          select: { id: true, currentStepId: true },
          orderBy: { id: "asc" },
        })
        servicesAfter = await services(tx)
        throw new Rollback()
      })
      .catch((error: unknown) => {
        if (!(error instanceof Rollback)) throw error
      })

    expect(mapped.map((row) => row.currentStepId)).toEqual([
      "plex",
      "tautulli",
      "overseerr",
      "sonarr",
      "radarr",
      "discord",
      "llm-chat",
      "llm-rewind",
      "prometheus",
      "prometheus",
    ])
    expect(servicesAfter).toEqual(servicesBefore)
  })
})
