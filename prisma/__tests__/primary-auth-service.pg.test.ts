/**
 * @jest-environment node
 */

/**
 * The `p1110_primary_auth_service_enum` migration against a real PostgreSQL
 * database (P11.10, GAP-24): the backfill, then the column's change from
 * TEXT to the `AuthService` enum.
 *
 * The test database is already migrated, so each run first puts the column
 * back to TEXT and drops the enum, seeds a row of every shape, runs the
 * migration and reads the rows, all inside a transaction that is rolled back.
 * Gated by `describePg`; run with `npm run test:integration`.
 */

import { readFileSync } from "node:fs"
import path from "node:path"

import { PrismaPg } from "@prisma/adapter-pg"

import { PrismaClient } from "@/lib/generated/prisma/client"
import { describePg } from "@/__tests__/helpers/integration"

const MIGRATION = path.join(__dirname, "..", "migrations", "20270116000000_p1110_primary_auth_service_enum", "migration.sql")

function statements(): string[] {
  return readFileSync(MIGRATION, "utf8")
    .split("\n")
    .filter((line) => !line.trimStart().startsWith("--"))
    .join("\n")
    .split(";")
    .map((statement) => statement.trim())
    .filter(Boolean)
}

/** id: [plexUserId, jellyfinUserId, stored value, expected value] */
const SHAPES: Record<string, [string | null, string | null, string | null, string | null]> = {
  "p1110-jf-only": [null, "p1110-jf-1", null, "jellyfin"],
  "p1110-jf-only-said-plex": [null, "p1110-jf-2", "plex", "jellyfin"],
  "p1110-plex-only": ["p1110-plex-1", null, null, "plex"],
  "p1110-plex-only-said-jf": ["p1110-plex-2", null, "jellyfin", "plex"],
  "p1110-both-unset": ["p1110-plex-3", "p1110-jf-3", null, "plex"],
  "p1110-both-jf": ["p1110-plex-4", "p1110-jf-4", "jellyfin", "jellyfin"],
  "p1110-both-plex": ["p1110-plex-5", "p1110-jf-5", "plex", "plex"],
  "p1110-both-typo": ["p1110-plex-6", "p1110-jf-6", "Jellyfin", null],
  "p1110-neither-typo": [null, null, "emby", null],
  "p1110-neither-unset": [null, null, null, null],
}

const literal = (value: string | null) => (value === null ? "NULL" : `'${value}'`)

class Rollback extends Error {}

describePg("primary_auth_service_enum migration", (databaseUrl) => {
  let db: PrismaClient

  beforeAll(() => {
    db = new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl }) })
  })

  afterAll(async () => {
    await db.$disconnect()
  })

  async function migrate() {
    let result: Record<string, string | null> = {}
    let columnType = ""
    await db
      .$transaction(async (tx) => {
        // Back to the column as it was before this migration
        await tx.$executeRawUnsafe(`ALTER TABLE "User" ALTER COLUMN "primaryAuthService" TYPE TEXT`)
        await tx.$executeRawUnsafe(`DROP TYPE "AuthService"`)
        for (const [id, [plex, jellyfin, stored]] of Object.entries(SHAPES)) {
          await tx.$executeRawUnsafe(
            `INSERT INTO "User" (id, "plexUserId", "jellyfinUserId", "primaryAuthService", "updatedAt")
             VALUES ('${id}', ${literal(plex)}, ${literal(jellyfin)}, ${literal(stored)}, now())`
          )
        }
        for (const statement of statements()) await tx.$executeRawUnsafe(statement)

        const rows = await tx.user.findMany({
          where: { id: { startsWith: "p1110-" } },
          select: { id: true, primaryAuthService: true },
        })
        result = Object.fromEntries(rows.map((row) => [row.id, row.primaryAuthService]))
        const [column] = await tx.$queryRawUnsafe<{ udt_name: string }[]>(
          `SELECT udt_name FROM information_schema.columns WHERE table_name = 'User' AND column_name = 'primaryAuthService'`
        )
        columnType = column?.udt_name ?? ""
        throw new Rollback()
      })
      .catch((error: unknown) => {
        if (!(error instanceof Rollback)) throw error
      })
    return { result, columnType }
  }

  it("backfills every shape and stores the column as the AuthService enum", async () => {
    const { result, columnType } = await migrate()

    expect(result).toEqual(Object.fromEntries(Object.entries(SHAPES).map(([id, shape]) => [id, shape[3]])))
    expect(columnType).toBe("AuthService")
  })

  it("leaves the shared database as it was", async () => {
    await migrate()
    await expect(db.user.count({ where: { id: { startsWith: "p1110-" } } })).resolves.toBe(0)
  })
})
